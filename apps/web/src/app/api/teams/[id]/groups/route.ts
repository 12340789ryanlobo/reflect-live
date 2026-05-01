// PATCH /api/teams/:id/groups
//
// Bulk operation on the players.group denormalized label for one team.
// Supports:
//   { from: 'distance', to: 'long-distance' }  → rename across the team
//   { from: 'distance', to: null }              → ungroup everyone in 'distance'
//   { from: 'old', to: 'existing-other' }       → merge (effective rename onto an existing label)
//
// Auth: caller must be an active coach on the team, or a platform admin.
// 'from' must match at least one player; otherwise the caller is acting
// on a stale list and we return 404 so the UI can refresh.

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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const teamId = Number(idStr);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: { from?: unknown; to?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const from = typeof body.from === 'string' ? body.from.trim() : null;
  if (!from) return NextResponse.json({ error: 'missing_from' }, { status: 400 });
  // `to` may be null (ungroup) or a non-empty string (rename / merge).
  const toRaw = body.to;
  let to: string | null;
  if (toRaw === null) {
    to = null;
  } else if (typeof toRaw === 'string') {
    const trimmed = toRaw.trim();
    if (!trimmed) return NextResponse.json({ error: 'empty_to' }, { status: 400 });
    if (trimmed === from) return NextResponse.json({ error: 'noop', detail: 'from === to' }, { status: 400 });
    to = trimmed;
  } else {
    return NextResponse.json({ error: 'bad_to' }, { status: 400 });
  }

  const sb = serviceClient();

  const [{ data: mem }, { data: prefs }] = await Promise.all([
    sb.from('team_memberships')
      .select('role, status')
      .eq('clerk_user_id', userId)
      .eq('team_id', teamId)
      .maybeSingle<{ role: string; status: string }>(),
    sb.from('user_preferences')
      .select('is_platform_admin')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ is_platform_admin: boolean }>(),
  ]);
  const isCoach = mem?.status === 'active' && mem.role === 'coach';
  const isPlatformAdmin = prefs?.is_platform_admin === true;
  if (!isCoach && !isPlatformAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Bulk-update + count in one round-trip via select-after-update.
  const { data: updated, error } = await sb
    .from('players')
    .update({ group: to })
    .eq('team_id', teamId)
    .eq('group', from)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'group_not_found', detail: `No players currently in '${from}'.` }, { status: 404 });
  }

  return NextResponse.json({ ok: true, affected: updated.length, from, to });
}
