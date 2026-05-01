// PATCH /api/teams/:id/requests/:clerkUserId
//
// body: { action: 'approve' | 'deny', reason?: string }
//
// On approve:
//   1. Insert a fresh players row with the request's name+phone+team.
//   2. Update the team_membership row: status='active', player_id=<new>,
//      decided_at=now(), decided_by=<approver>.
// On deny:
//   1. Update the team_membership row: status='denied',
//      deny_reason=<reason or null>, decided_at=now(), decided_by=<approver>.
//
// Decision SMS (1e): after the row is updated successfully, send a one-shot
// SMS to the requester. Fire-and-forget — failures are logged in the
// response payload but don't roll back the decision.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getTwilioConfigForTeam, sendSms } from '@/lib/twilio-sms';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function appBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, '');
  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : 'https://reflect-live-delta.vercel.app';
}

async function sendDecisionSms(opts: {
  sb: ReturnType<typeof serviceClient>;
  teamId: number;
  toPhone: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const cfg = await getTwilioConfigForTeam(opts.sb, opts.teamId);
    await sendSms(cfg, opts.toPhone, opts.body);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; clerkUserId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: teamIdStr, clerkUserId } = await ctx.params;
  const teamId = Number(teamIdStr);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });
  if (!clerkUserId) return NextResponse.json({ error: 'bad_user_id' }, { status: 400 });

  let body: { action?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const action = body.action;
  if (action !== 'approve' && action !== 'deny') {
    return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null;

  const sb = serviceClient();

  // Authorize: caller must be active coach/captain on this team or platform admin.
  const { data: callerMembership } = await sb
    .from('team_memberships')
    .select('role, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle<{ role: string; status: string }>();
  const { data: prefs } = await sb
    .from('user_preferences')
    .select('is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean }>();
  const isManager =
    callerMembership?.status === 'active' &&
    (callerMembership.role === 'coach' || callerMembership.role === 'captain');
  const isPlatformAdmin = prefs?.is_platform_admin === true;
  if (!isManager && !isPlatformAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Load the request row.
  const { data: request } = await sb
    .from('team_memberships')
    .select('clerk_user_id, team_id, status, requested_name, requested_phone, requested_email')
    .eq('clerk_user_id', clerkUserId)
    .eq('team_id', teamId)
    .maybeSingle<{
      status: string;
      requested_name: string | null;
      requested_phone: string | null;
      requested_email: string | null;
    }>();
  if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (request.status !== 'requested') {
    return NextResponse.json(
      { error: 'wrong_status', actual: request.status },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  // Pull the team name once — we use it in the SMS copy below.
  const { data: teamRow } = await sb
    .from('teams')
    .select('name')
    .eq('id', teamId)
    .maybeSingle<{ name: string }>();
  const teamName = teamRow?.name ?? 'your team';
  const baseUrl = appBaseUrl(req);

  if (action === 'deny') {
    const { data, error } = await sb
      .from('team_memberships')
      .update({
        status: 'denied',
        deny_reason: reason,
        decided_at: now,
        decided_by: userId,
      })
      .eq('clerk_user_id', clerkUserId)
      .eq('team_id', teamId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });

    let sms: { ok: true } | { ok: false; error: string } | { ok: false; error: 'no_phone' } = { ok: false, error: 'no_phone' };
    if (request.requested_phone) {
      const reasonClause = reason ? `: ${reason}` : '';
      const body = `${teamName} declined your request${reasonClause}. You can request again at ${baseUrl}/onboarding`;
      sms = await sendDecisionSms({ sb, teamId, toPhone: request.requested_phone, body });
    }
    return NextResponse.json({ ok: true, membership: data, sms });
  }

  // approve: create the players row first.
  if (!request.requested_name || !request.requested_phone) {
    return NextResponse.json({ error: 'request_missing_name_or_phone' }, { status: 400 });
  }

  // Linkage waterfall — try the cheapest, most reliable match first:
  //   1. Phone match: same team_id + phone_e164. The CSV-seeded roster
  //      typically has phones, and athletes signing up with the same
  //      phone are almost certainly the same person.
  //   2. Name match (fallback): exactly one UNLINKED roster player on
  //      the team has the same case-insensitive trimmed name. This
  //      catches the legacy case where the seeded phone format differs
  //      from what the athlete enters. Multiple matches → fail loudly
  //      so a coach has to disambiguate via /dashboard/admin/users.
  //   3. Otherwise: create a fresh players row.
  let playerId: number | null = null;

  // Phone match: hits player_phones (covers ALT numbers from
  // international students with US + home-country phones), then falls
  // back to the legacy players.phone_e164 cache for players that
  // somehow don't have a player_phones row yet. Two-step: find candidate
  // player_ids by e164, then narrow to this team via a follow-up query.
  // (Avoids fragile typing on supabase's relation joins.)
  const { data: phoneRows } = await sb
    .from('player_phones')
    .select('player_id')
    .eq('e164', request.requested_phone);
  const candidateIds = ((phoneRows ?? []) as Array<{ player_id: number }>).map((r) => r.player_id);
  if (candidateIds.length > 0) {
    const { data: scoped } = await sb
      .from('players')
      .select('id')
      .eq('team_id', teamId)
      .in('id', candidateIds)
      .limit(1);
    if (scoped && scoped.length > 0) playerId = (scoped[0] as { id: number }).id;
  }
  if (playerId == null) {
    const { data: phoneMatch } = await sb
      .from('players')
      .select('id')
      .eq('team_id', teamId)
      .eq('phone_e164', request.requested_phone)
      .maybeSingle<{ id: number }>();
    if (phoneMatch) playerId = phoneMatch.id;
  }

  if (playerId == null) {
    // Name-match fallback. Pull all players + linked memberships and do
    // the unlink + name comparison in JS so case-insensitive 'ilike' on
    // a small per-team set stays simple. (A few hundred rows max.)
    const [{ data: teamPlayers }, { data: linkedMems }] = await Promise.all([
      sb.from('players').select('id, name').eq('team_id', teamId),
      sb.from('team_memberships').select('player_id').eq('team_id', teamId).eq('status', 'active').not('player_id', 'is', null),
    ]);
    const linkedSet = new Set<number>(
      ((linkedMems ?? []) as Array<{ player_id: number | null }>).map((r) => r.player_id!).filter(Boolean),
    );
    const wanted = request.requested_name.trim().toLowerCase();
    const nameMatches = ((teamPlayers ?? []) as Array<{ id: number; name: string }>)
      .filter((p) => !linkedSet.has(p.id) && p.name.trim().toLowerCase() === wanted);
    if (nameMatches.length === 1) {
      playerId = nameMatches[0].id;
    } else if (nameMatches.length > 1) {
      return NextResponse.json(
        {
          error: 'ambiguous_name_match',
          detail: `${nameMatches.length} unlinked players named '${request.requested_name}' on this team — link manually via /dashboard/admin/users.`,
        },
        { status: 409 },
      );
    }
  }

  if (playerId == null) {
    const { data: created, error: insErr } = await sb
      .from('players')
      .insert({
        team_id: teamId,
        name: request.requested_name,
        phone_e164: request.requested_phone,
        active: true,
      })
      .select('id')
      .single();
    if (insErr) {
      return NextResponse.json({ error: 'player_insert_failed', detail: insErr.message }, { status: 500 });
    }
    playerId = created.id as number;
    // Also seed the primary row in player_phones — the worker's
    // inbound matcher reads from there, not from players.phone_e164.
    await sb.from('player_phones').insert({
      player_id: playerId,
      e164: request.requested_phone,
      is_primary: true,
    });
  }

  // Flip the membership to active and link the player. If this is the
  // user's first active membership, also flag default_team=true.
  const { count: existingActiveCount } = await sb
    .from('team_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('clerk_user_id', clerkUserId)
    .eq('status', 'active');

  const isFirstActive = (existingActiveCount ?? 0) === 0;

  const { data, error } = await sb
    .from('team_memberships')
    .update({
      status: 'active',
      player_id: playerId,
      decided_at: now,
      decided_by: userId,
      default_team: isFirstActive,
    })
    .eq('clerk_user_id', clerkUserId)
    .eq('team_id', teamId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });

  // Pre-link the user_preferences.impersonate_player_id so a freshly-approved
  // athlete lands on their own /dashboard/athlete view immediately, instead of
  // the empty "Pick an athlete to simulate" picker. (B1 fix — keeps the
  // per-user "linked athlete" field in sync with the per-team membership.)
  await sb
    .from('user_preferences')
    .update({ impersonate_player_id: playerId })
    .eq('clerk_user_id', clerkUserId);

  const approveBody = `${teamName} approved your request. Open your dashboard at ${baseUrl}/dashboard`;
  const sms = request.requested_phone
    ? await sendDecisionSms({ sb, teamId, toPhone: request.requested_phone, body: approveBody })
    : ({ ok: false, error: 'no_phone' } as const);

  return NextResponse.json({ ok: true, membership: data, player_id: playerId, sms });
}
