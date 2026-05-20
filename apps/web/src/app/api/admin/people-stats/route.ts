// GET /api/admin/people-stats — platform-wide count of distinct
// humans who have interacted with reflect-live in any way.
//
// "Interacted" means at least one of:
//   - has a Clerk account (user_preferences row) — coaches / admins /
//     athletes who signed up
//   - has sent at least one inbound SMS/WhatsApp message (twilio_messages
//     row with player_id resolved)
//   - has logged at least one activity (activity_logs row)
//   - has answered at least one survey question (responses row)
//   - has filed at least one injury report (injury_reports row)
//
// Dedupe across these sources happens via player_id (linked to a
// Clerk user via user_preferences.impersonate_player_id). The output
// is intentionally platform-wide, not team-scoped — this powers the
// admin overview where the question is "how many people total use
// this thing", not "how many on my team".
//
// Why a dedicated endpoint instead of doing it in the browser:
// the browser Supabase client is RLS-restricted, so player counts
// off active_team would be wrong for the admin's view, and
// user_preferences only returns the caller's own row (see /api/users
// for the same reason).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin } from '@/lib/admin-guard';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const sb = serviceClient();

  // For the per-team rollup we need team_id alongside player_id, so
  // we pull team_id on each engagement source. Cheap — same row
  // count, one extra column.
  const [prefsRes, msgsRes, actsRes, respsRes, injsRes, playersRes, teamsRes] = await Promise.all([
    sb.from('user_preferences').select('clerk_user_id, role, impersonate_player_id, team_id'),
    sb.from('twilio_messages').select('player_id, team_id').not('player_id', 'is', null),
    sb.from('activity_logs').select('player_id, team_id'),
    sb.from('responses').select('player_id, session_id'),
    sb.from('injury_reports').select('player_id, team_id'),
    sb.from('players').select('id, team_id'),
    sb.from('teams').select('id, name').order('name'),
  ]);

  // responses doesn't carry team_id directly — resolve via player_id
  // → players.team_id. Build the lookup once, reuse below.
  const playerTeam = new Map<number, number>();
  for (const p of playersRes.data ?? []) {
    playerTeam.set(p.id as number, p.team_id as number);
  }

  const prefs = prefsRes.data ?? [];
  const engagedPlayerIds = new Set<number>();
  // Per-team buckets of engaged players for the breakdown table.
  const engagedByTeam = new Map<number, Set<number>>();
  function addEngagement(playerId: number | null | undefined, teamId: number | null | undefined) {
    if (playerId == null) return;
    engagedPlayerIds.add(playerId);
    const t = teamId ?? playerTeam.get(playerId);
    if (t != null) {
      let bucket = engagedByTeam.get(t);
      if (!bucket) { bucket = new Set(); engagedByTeam.set(t, bucket); }
      bucket.add(playerId);
    }
  }
  for (const r of msgsRes.data ?? []) addEngagement(r.player_id, r.team_id);
  for (const r of actsRes.data ?? []) addEngagement(r.player_id, r.team_id);
  for (const r of respsRes.data ?? []) addEngagement(r.player_id, null);
  for (const r of injsRes.data ?? []) addEngagement(r.player_id, r.team_id);

  // Bucket Clerk users by whether they're linked to a player. The
  // linked ones might double-count an athlete who also signed up
  // for the dashboard, so we merge them with engagedPlayerIds.
  // Un-linked ones (coaches / admins) are additive humans.
  const clerkLinkedPlayerIds = new Set<number>();
  let dashboardOnlyUsers = 0;
  for (const p of prefs) {
    if (p.impersonate_player_id != null) {
      clerkLinkedPlayerIds.add(p.impersonate_player_id as number);
    } else {
      dashboardOnlyUsers += 1;
    }
  }

  const distinctPlayerIds = new Set<number>([...engagedPlayerIds, ...clerkLinkedPlayerIds]);
  const totalPeople = distinctPlayerIds.size + dashboardOnlyUsers;

  // Build the per-team table. For each team, count:
  //   - engaged athletes (from engagedByTeam)
  //   - Clerk users on that team (via user_preferences.team_id)
  // dashboard-only users (team_id null) get an extra row at the end.
  const teams = teamsRes.data ?? [];
  const clerkUsersByTeam = new Map<number, number>();
  let clerkUnassigned = 0;
  for (const p of prefs) {
    if (p.team_id != null) {
      clerkUsersByTeam.set(p.team_id, (clerkUsersByTeam.get(p.team_id) ?? 0) + 1);
    } else {
      clerkUnassigned += 1;
    }
  }
  const perTeam = teams.map((t) => ({
    team_id: t.id,
    name: t.name,
    engaged_athletes: engagedByTeam.get(t.id)?.size ?? 0,
    clerk_users: clerkUsersByTeam.get(t.id) ?? 0,
  }));

  return NextResponse.json({
    total_people: totalPeople,
    engaged_athletes: engagedPlayerIds.size,
    clerk_users: prefs.length,
    dashboard_only_users: dashboardOnlyUsers,
    per_team: perTeam,
    unassigned_clerk_users: clerkUnassigned,
    sources: {
      inbound_messages: new Set((msgsRes.data ?? []).map((r) => r.player_id).filter((x) => x != null)).size,
      activity_logs:    new Set((actsRes.data ?? []).map((r) => r.player_id).filter((x) => x != null)).size,
      responses:        new Set((respsRes.data ?? []).map((r) => r.player_id).filter((x) => x != null)).size,
      injury_reports:   new Set((injsRes.data ?? []).map((r) => r.player_id).filter((x) => x != null)).size,
    },
  });
}

export const dynamic = 'force-dynamic';
