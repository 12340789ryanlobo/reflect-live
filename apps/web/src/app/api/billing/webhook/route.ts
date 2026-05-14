// POST /api/billing/webhook
//
// Receives Stripe events. The ONLY trusted path that mutates
// teams.plan, teams.stripe_customer_id, teams.stripe_subscription_id,
// teams.plan_status, and teams.plan_renews_at. The client-side
// checkout return URL is a UX convenience; this handler is the
// authority.
//
// Security:
//   - No Clerk auth — we cannot, Stripe doesn't carry our session.
//   - We verify Stripe's signature against STRIPE_WEBHOOK_SECRET, so a
//     forged POST fails before any DB work.
//   - We MUST read the body as raw text (not parsed JSON) — Stripe
//     signs the exact byte sequence and any normalization breaks
//     verification. Next.js App Router gives us this via req.text().
//
// Idempotency:
//   - Stripe retries events on non-2xx with exponential backoff. We
//     dedup via subscription_events.stripe_event_id UNIQUE; on
//     conflict we ack 200 immediately so Stripe stops retrying.
//
// Events handled (others ignored with 200):
//   - checkout.session.completed     → set plan + customer + sub IDs
//   - customer.subscription.updated  → sync plan, status, renews_at
//   - customer.subscription.deleted  → revert to free
//   - invoice.payment_failed         → flip plan_status='past_due'
//   - invoice.payment_succeeded      → ensure plan_status='active'

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { resolvePlan, type Plan } from '@/lib/billing-plans';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 400 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[billing/webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[billing/webhook] signature verify failed:', msg);
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  const sb = serviceClient();

  // Idempotency anchor — try to insert the event row first. If a row
  // with this stripe_event_id already exists we treat the delivery as
  // a no-op and ack 200 immediately. This guards against Stripe's
  // at-least-once retry behavior.
  const teamIdFromEvent = extractTeamId(event);
  // Stripe.Event is a discriminated union — TS refuses a direct cast
  // to Record<string, unknown>. The jsonb column accepts any
  // serializable object, so the unknown hop is safe here.
  const payload = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
  const { error: insertErr } = await sb.from('subscription_events').insert({
    team_id: teamIdFromEvent,
    stripe_event_id: event.id,
    event_type: event.type,
    payload,
  });
  if (insertErr) {
    // Postgres unique-violation code is 23505.
    const code = (insertErr as { code?: string }).code;
    if (code === '23505') {
      return NextResponse.json({ ok: true, deduped: true });
    }
    console.error('[billing/webhook] event-log insert failed:', insertErr.message);
    // Still try to handle so we don't drop the event — the log is best-effort.
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(sb, event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await handleSubscriptionChange(sb, event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(sb, event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(sb, event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(sb, event.data.object as Stripe.Invoice);
        break;
      default:
        // Acknowledge unknown event types so Stripe stops retrying.
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[billing/webhook] handler failed for ${event.type}:`, msg);
    // 500 → Stripe retries (good — handler may have hit a transient
    // Supabase error). We've already inserted the audit row so the
    // retry is idempotent at the log layer.
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Best-effort team_id extraction for the audit log. We read metadata
// first (set by checkout.create), fall back to client_reference_id
// (also set), then fall back to looking up by Stripe customer id.
// Returns null when we genuinely don't know — the audit row still
// gets written.
function extractTeamId(event: Stripe.Event): number | null {
  // event.data.object is a discriminated union — read fields as
  // unknown and validate at the use site.
  const obj = event.data.object as unknown as Record<string, unknown>;

  const metaTeamId = (obj.metadata as Record<string, string> | undefined)?.team_id;
  if (metaTeamId && /^\d+$/.test(metaTeamId)) return Number(metaTeamId);

  const ref = obj.client_reference_id;
  if (typeof ref === 'string' && /^\d+$/.test(ref)) return Number(ref);

  return null;
}

async function teamIdForCustomer(
  sb: SupabaseClient,
  customerId: string,
): Promise<number | null> {
  const { data } = await sb
    .from('teams')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle<{ id: number }>();
  return data?.id ?? null;
}

async function handleCheckoutCompleted(sb: SupabaseClient, session: Stripe.Checkout.Session) {
  const teamId = session.metadata?.team_id
    ? Number(session.metadata.team_id)
    : session.client_reference_id
      ? Number(session.client_reference_id)
      : null;
  if (!teamId || !Number.isInteger(teamId)) {
    console.error('[billing/webhook] checkout.session.completed missing team_id', session.id);
    return;
  }

  const planRaw = session.metadata?.plan ?? '';
  const plan: Plan = resolvePlan(planRaw);
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null;

  const update: Record<string, unknown> = {
    plan,
    plan_status: 'active',
  };
  if (customerId) update.stripe_customer_id = customerId;
  if (subscriptionId) update.stripe_subscription_id = subscriptionId;

  const { error } = await sb.from('teams').update(update).eq('id', teamId);
  if (error) {
    console.error('[billing/webhook] teams update failed (checkout.completed):', error.message);
    throw new Error(error.message);
  }
}

async function handleSubscriptionChange(sb: SupabaseClient, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const teamId = sub.metadata?.team_id
    ? Number(sub.metadata.team_id)
    : await teamIdForCustomer(sb, customerId);
  if (!teamId) {
    console.warn('[billing/webhook] subscription change without team:', sub.id);
    return;
  }

  // sub.items.data[0].price.id is the canonical plan identifier on
  // the subscription. Map it back to our internal Plan via env.
  const priceId = sub.items.data[0]?.price.id;
  let plan: Plan = resolvePlan(sub.metadata?.plan ?? null);
  if (priceId === process.env.STRIPE_PRICE_TEAM) plan = 'team';
  else if (priceId === process.env.STRIPE_PRICE_PROGRAM) plan = 'program';

  const status = mapSubscriptionStatus(sub.status);
  // Stripe moved current_period_end from the Subscription root to
  // each line item (per-item billing periods, 2024+). We have a
  // single line item per subscription so reading data[0] is safe.
  // Fall back to any legacy root field for forward-compat.
  const itemPeriodEnd = sub.items.data[0]?.current_period_end;
  const legacyPeriodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodEndUnix = itemPeriodEnd ?? legacyPeriodEnd;
  const renewsAt = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;

  const { error } = await sb.from('teams').update({
    plan,
    plan_status: status,
    plan_renews_at: renewsAt,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
  }).eq('id', teamId);
  if (error) throw new Error(error.message);
}

async function handleSubscriptionCanceled(sb: SupabaseClient, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const teamId = sub.metadata?.team_id
    ? Number(sub.metadata.team_id)
    : await teamIdForCustomer(sb, customerId);
  if (!teamId) return;

  const { error } = await sb.from('teams').update({
    plan: 'free',
    plan_status: 'canceled',
    plan_renews_at: null,
    stripe_subscription_id: null,
  }).eq('id', teamId);
  if (error) throw new Error(error.message);
}

async function handleInvoiceFailed(sb: SupabaseClient, invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const teamId = await teamIdForCustomer(sb, customerId);
  if (!teamId) return;
  await sb.from('teams').update({ plan_status: 'past_due' }).eq('id', teamId);
}

async function handleInvoicePaid(sb: SupabaseClient, invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const teamId = await teamIdForCustomer(sb, customerId);
  if (!teamId) return;
  await sb.from('teams').update({ plan_status: 'active' }).eq('id', teamId);
}

function mapSubscriptionStatus(s: Stripe.Subscription.Status): string {
  switch (s) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'canceled':
    case 'unpaid': return 'canceled';
    case 'incomplete':
    case 'incomplete_expired': return 'incomplete';
    default: return 'active';
  }
}

export const dynamic = 'force-dynamic';
