// PATCH /api/teams/:id   — admin: freeze, unfreeze, approve pending team
// DELETE /api/teams/:id  — admin or active coach: hard delete with
//                          cascade through every child table + Stripe
//                          subscription cancellation if applicable.
//
// Per-id endpoint complements /api/teams (GET list + POST create). The
// status transitions live here so the route signature stays simple
// (one body verb per request).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { serviceClient } from '@/lib/supabase-server';
import { requirePlatformAdmin } from '@/lib/admin-guard';
import { getStripe } from '@/lib/stripe';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: { action?: unknown; plan?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const action = body.action;
  const sb = serviceClient();

  // Plan-flip path. Separate from the freeze/approve/reset actions so
  // we don't conflate billing state with creation_status state. Body:
  // { action: 'set_plan', plan: 'free' | 'team' | 'program' }.
  if (action === 'set_plan') {
    const plan = body.plan;
    if (plan !== 'free' && plan !== 'team' && plan !== 'program') {
      return NextResponse.json({ error: 'bad_plan' }, { status: 400 });
    }
    const { data, error } = await sb
      .from('teams')
      .update({ plan })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, team: data });
  }

  let nextStatus: 'pending' | 'active' | 'suspended';
  if (action === 'freeze') nextStatus = 'suspended';
  else if (action === 'unfreeze' || action === 'approve') nextStatus = 'active';
  else if (action === 'reset_pending') nextStatus = 'pending';
  else return NextResponse.json({ error: 'bad_action' }, { status: 400 });

  const { data, error } = await sb
    .from('teams')
    .update({ creation_status: nextStatus })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, team: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  // Auth: platform admin OR an active coach on this specific team.
  // Coaches can self-service team deletion from /dashboard/settings;
  // admins keep the cross-team capability from /dashboard/admin/teams.
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = serviceClient();
  const adminGate = await requirePlatformAdmin();
  let isAdmin = adminGate.ok;
  if (!isAdmin) {
    const { data: m } = await sb
      .from('team_memberships')
      .select('role, status')
      .eq('clerk_user_id', userId)
      .eq('team_id', id)
      .maybeSingle<{ role: string; status: string }>();
    const isCoach = m?.status === 'active' && m?.role === 'coach';
    if (!isCoach) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Read team for Stripe + naming. We need stripe_subscription_id BEFORE
  // the row is gone, and the cascade is safer if we know what we're
  // about to nuke.
  const { data: team, error: tErr } = await sb
    .from('teams')
    .select('id, name, stripe_subscription_id')
    .eq('id', id)
    .maybeSingle<{ id: number; name: string; stripe_subscription_id: string | null }>();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!team) return NextResponse.json({ error: 'team_not_found' }, { status: 404 });

  // Cancel Stripe subscription at the end of the current billing
  // period so the customer isn't billed beyond what they've already
  // paid for, but data goes immediately. We don't wait for the
  // webhook to confirm — the team row is about to be deleted, so
  // the webhook handler will no-op when it can't find the team.
  if (team.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.update(team.stripe_subscription_id, { cancel_at_period_end: true });
    } catch (e) {
      // Don't block deletion on a Stripe API hiccup — surface it but
      // continue. The customer can still cancel manually from
      // Stripe's email link if our cancellation didn't land.
      console.error('[teams DELETE] stripe cancel_at_period_end failed:', (e as Error).message);
    }
  }

  // Gather the child-of-child ids before deleting anything so we can
  // sweep transitive references (sessions → deliveries/responses/etc.,
  // locations → weather_snapshots).
  const [sessionsRes, locationsRes] = await Promise.all([
    sb.from('sessions').select('id').eq('team_id', id),
    sb.from('locations').select('id').eq('team_id', id),
  ]);
  const sessionIds = (sessionsRes.data ?? []).map((s) => s.id);
  const locationIds = (locationsRes.data ?? []).map((l) => l.id);

  // Helper: best-effort cascade step. We don't abort on a single
  // table failure — deleting a team is destructive enough that
  // half-cleaning is still preferable to silently bailing.
  const steps: Array<{ name: string; error: string | null }> = [];
  // Supabase's PostgrestFilterBuilder is thenable but not a real
  // Promise, so we type the parameter as PromiseLike to accept it.
  async function step(name: string, p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    steps.push({ name, error: error?.message ?? null });
    if (error) console.error(`[teams DELETE] ${name} failed:`, error.message);
  }

  // 1. Session sub-children (only if there are any sessions to clean).
  if (sessionIds.length) {
    await step('responses',       sb.from('responses').delete().in('session_id', sessionIds));
    await step('flags',           sb.from('flags').delete().in('session_id', sessionIds));
    await step('deliveries',      sb.from('deliveries').delete().in('session_id', sessionIds));
    await step('scheduled_sends', sb.from('scheduled_sends').delete().in('session_id', sessionIds));
  }

  // 2. Location sub-children.
  if (locationIds.length) {
    await step('weather_snapshots', sb.from('weather_snapshots').delete().in('location_id', locationIds));
  }

  // 3. Direct children of teams. Order matters: rows that reference
  // both team_id AND player_id must go before players themselves.
  await step('injury_reports',     sb.from('injury_reports').delete().eq('team_id', id));
  await step('activity_logs',      sb.from('activity_logs').delete().eq('team_id', id));
  await step('twilio_messages',    sb.from('twilio_messages').delete().eq('team_id', id));
  await step('phone_verifications',sb.from('phone_verifications').delete().eq('team_id', id));
  await step('dry_run_log',        sb.from('dry_run_log').delete().eq('team_id', id));
  await step('question_templates', sb.from('question_templates').delete().eq('team_id', id));
  await step('sessions',           sb.from('sessions').delete().eq('team_id', id));
  await step('locations',          sb.from('locations').delete().eq('team_id', id));
  await step('team_memberships',   sb.from('team_memberships').delete().eq('team_id', id));
  await step('players',            sb.from('players').delete().eq('team_id', id));

  // 4. Sever user_preferences without deleting the prefs row — users
  // keep their account and settings; dashboard-shell heals their
  // active team on next render via their remaining memberships.
  await step(
    'user_preferences (sever)',
    sb.from('user_preferences')
      .update({ team_id: null, impersonate_player_id: null })
      .eq('team_id', id),
  );

  // subscription_events.team_id has ON DELETE SET NULL so we don't
  // touch it; rows stay as a historical audit trail.

  // 5. Finally, the team itself.
  const { error: delErr } = await sb.from('teams').delete().eq('id', id);
  if (delErr) {
    return NextResponse.json(
      { error: 'team_delete_failed', detail: delErr.message, steps },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, team: { id: team.id, name: team.name }, steps });
}

export const dynamic = 'force-dynamic';
