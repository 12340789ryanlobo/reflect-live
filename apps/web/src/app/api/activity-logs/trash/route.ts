// apps/web/src/app/api/activity-logs/trash/route.ts
//
// GET /api/activity-logs/trash?player_id=<id>
// Lists soft-deleted (hidden=true) activity_logs for a player so the
// athlete page can offer Restore. Auth matches the delete endpoints:
// linked athlete or coach/admin on the player's team.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { canDeleteActivityRow } from '@/lib/delete-permissions';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const playerId = Number(req.nextUrl.searchParams.get('player_id'));
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: 'bad_player_id' }, { status: 400 });
  }

  const sb = serviceClient();

  const { data: player } = await sb
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .maybeSingle<{ id: number; team_id: number }>();
  if (!player) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: pref } = await sb
    .from('user_preferences')
    .select('role, team_id, impersonate_player_id, is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{
      role: string | null;
      team_id: number | null;
      impersonate_player_id: number | null;
      is_platform_admin: boolean | null;
    }>();

  const allowed = canDeleteActivityRow({
    pref,
    rowPlayerId: player.id,
    rowTeamId: player.team_id,
  });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: rows, error } = await sb
    .from('activity_logs')
    .select('id, kind, description, logged_at')
    .eq('player_id', playerId)
    .eq('hidden', true)
    .order('logged_at', { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: rows ?? [] });
}
