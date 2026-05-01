// GET /api/teams/:id/requests
//
// Lists pending join requests (status='requested') for the team. Caller
// must be a coach or captain on that team, OR platform admin. Returns
// the data the inbox needs to render — name, email, phone, requested_at,
// plus a 'roster_match' suggestion when the requested name maps cleanly
// to exactly one unlinked roster player (case-insensitive, trimmed).
// Multiple matches return null so the coach is forced to disambiguate
// rather than auto-linking the wrong row.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: teamIdStr } = await ctx.params;
  const teamId = Number(teamIdStr);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });

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

  const [{ data, error }, { data: players }, { data: linkedRows }] = await Promise.all([
    sb.from('team_memberships')
      .select('clerk_user_id, team_id, requested_name, requested_email, requested_phone, requested_at, status')
      .eq('team_id', teamId)
      .eq('status', 'requested')
      .order('requested_at', { ascending: true }),
    sb.from('players').select('id, name, phone_e164').eq('team_id', teamId),
    sb.from('team_memberships').select('player_id').eq('team_id', teamId).eq('status', 'active').not('player_id', 'is', null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build the unlinked-by-name index. A player is "unlinked" if no active
  // membership row already points at them. Group by lowercase trimmed name
  // so a single requested_name lookup is O(1).
  const linkedIds = new Set<number>(
    ((linkedRows ?? []) as Array<{ player_id: number | null }>).map((r) => r.player_id!).filter(Boolean),
  );
  const unlinkedByName = new Map<string, Array<{ id: number; name: string; phone_e164: string | null }>>();
  for (const p of (players ?? []) as Array<{ id: number; name: string; phone_e164: string | null }>) {
    if (linkedIds.has(p.id)) continue;
    const key = p.name.trim().toLowerCase();
    const arr = unlinkedByName.get(key) ?? [];
    arr.push(p);
    unlinkedByName.set(key, arr);
  }

  const enriched = (data ?? []).map((r) => {
    const key = (r.requested_name ?? '').trim().toLowerCase();
    const matches = key ? (unlinkedByName.get(key) ?? []) : [];
    // Only surface a single unambiguous match. Multiple matches force the
    // coach to disambiguate via the legacy /dashboard/admin/users tool.
    const roster_match =
      matches.length === 1
        ? { id: matches[0].id, name: matches[0].name, phone_e164: matches[0].phone_e164 }
        : null;
    const ambiguous_match_count = matches.length > 1 ? matches.length : 0;
    return { ...r, roster_match, ambiguous_match_count };
  });

  return NextResponse.json({ requests: enriched });
}
