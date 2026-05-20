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

  const [prefsRes, msgsRes, actsRes, respsRes, injsRes] = await Promise.all([
    sb.from('user_preferences').select('clerk_user_id, role, impersonate_player_id'),
    sb.from('twilio_messages').select('player_id').not('player_id', 'is', null),
    sb.from('activity_logs').select('player_id'),
    sb.from('responses').select('player_id'),
    sb.from('injury_reports').select('player_id'),
  ]);

  const prefs = prefsRes.data ?? [];
  const engagedPlayerIds = new Set<number>();
  for (const r of msgsRes.data ?? []) if (r.player_id != null) engagedPlayerIds.add(r.player_id);
  for (const r of actsRes.data ?? []) if (r.player_id != null) engagedPlayerIds.add(r.player_id);
  for (const r of respsRes.data ?? []) if (r.player_id != null) engagedPlayerIds.add(r.player_id);
  for (const r of injsRes.data ?? []) if (r.player_id != null) engagedPlayerIds.add(r.player_id);

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

  return NextResponse.json({
    total_people: totalPeople,
    engaged_athletes: engagedPlayerIds.size,
    clerk_users: prefs.length,
    dashboard_only_users: dashboardOnlyUsers,
    // Per-source breakdown, useful for debugging "where did this
    // count come from" but not surfaced on the page by default.
    sources: {
      inbound_messages: new Set((msgsRes.data ?? []).map((r) => r.player_id).filter((x) => x != null)).size,
      activity_logs:    new Set((actsRes.data ?? []).map((r) => r.player_id).filter((x) => x != null)).size,
      responses:        new Set((respsRes.data ?? []).map((r) => r.player_id).filter((x) => x != null)).size,
      injury_reports:   new Set((injsRes.data ?? []).map((r) => r.player_id).filter((x) => x != null)).size,
    },
  });
}

export const dynamic = 'force-dynamic';
