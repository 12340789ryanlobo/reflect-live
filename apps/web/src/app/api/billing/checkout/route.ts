// POST /api/billing/checkout
//
// Body: { team_id: number, plan: 'team' | 'program', invoice_mode?: boolean }
//
// Creates a Stripe Checkout Session for the requested team + plan and
// returns { url } for the client to redirect to. The actual plan
// flip happens later in the webhook handler when Stripe fires
// checkout.session.completed — we do NOT trust the client's return
// trip to mutate teams.plan.
//
// invoice_mode=true switches to ACH-only collection and sets the
// session to email the customer an invoice. Useful for athletic
// departments that pay by PO; the subscription activates on receipt.
//
// Idempotency: Stripe sessions are themselves single-use, and the
// downstream webhook is dedup'd on stripe_event_id, so a double-POST
// from a flaky client just creates two unused sessions. Cheap.

import { NextResponse } from 'next/server';
import { requireBillingActor } from '@/lib/billing-guard';
import { getStripe, priceIdForPlan } from '@/lib/stripe';
import { resolvePlan } from '@/lib/billing-plans';

export async function POST(req: Request) {
  let body: { team_id?: unknown; plan?: unknown; invoice_mode?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const teamId = Number(body.team_id);
  const planRaw = typeof body.plan === 'string' ? body.plan : '';
  const plan = resolvePlan(planRaw);
  if (plan === 'free') {
    return NextResponse.json({ error: 'cannot_checkout_free' }, { status: 400 });
  }

  const gate = await requireBillingActor(teamId);
  if (!gate.ok) return gate.response;
  const { team, sb } = gate;

  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json({ error: 'price_not_configured', plan }, { status: 500 });
  }

  const stripe = getStripe();

  // Build absolute return URLs from the incoming request's origin so
  // this works on localhost, preview, and prod without an extra env.
  const origin = new URL(req.url).origin;
  const successUrl = `${origin}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/dashboard/billing?status=cancelled`;

  const invoiceMode = body.invoice_mode === true;

  // Reuse an existing Customer for this team if we have one — keeps
  // their card on file, dunning history, and portal access tied to a
  // single Stripe entity rather than fragmenting across sessions.
  const customerArgs: { customer?: string; customer_email?: string } = {};
  if (team.stripe_customer_id) {
    customerArgs.customer = team.stripe_customer_id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(team.id),
    // Mirrored into the subscription so the webhook can route the
    // event back to the right team even if client_reference_id is
    // dropped by a Stripe API change.
    metadata: { team_id: String(team.id), plan },
    subscription_data: {
      metadata: { team_id: String(team.id), plan },
    },
    // ACH path for departments paying by PO. `us_bank_account` is
    // Stripe's official invoice/ACH channel — the receipt is emailed
    // and the subscription waits on first payment.
    payment_method_types: invoiceMode ? ['us_bank_account'] : ['card'],
    allow_promotion_codes: true,
    ...customerArgs,
  });

  // Record a thin breadcrumb so an admin debugging "did the user even
  // start checkout?" can grep subscription_events. The webhook
  // handler will write the matching .completed row when it fires.
  await sb.from('subscription_events').insert({
    team_id: team.id,
    stripe_event_id: `checkout.session.created:${session.id}`,
    event_type: 'checkout.session.created',
    payload: { session_id: session.id, plan, invoice_mode: invoiceMode },
  }).then(() => {}, () => {});  // best-effort, never blocks the redirect

  if (!session.url) {
    return NextResponse.json({ error: 'no_session_url' }, { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}

export const dynamic = 'force-dynamic';
