// apps/web/src/app/api/self-report/trash/route.ts
//
// GET /api/self-report/trash?player_id=<id>
// Lists soft-deleted (hidden=true) self-report sessions for a player,
// grouped by session_id (one restorable entry per session). Auth matches
// the delete endpoints. Bot-survey rows (session_id NULL) are excluded.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { serviceClient } from '@/lib/supabase-server';
import { canDeleteActivityRow } from '@/lib/delete-permissions';

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
    .from('twilio_messages')
    .select('session_id, body, direction, date_sent')
    .eq('player_id', playerId)
    .eq('hidden', true)
    .not('session_id', 'is', null)
    .order('date_sent', { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
  }

  // Group by session_id. Each session is one restorable entry: earliest
  // date_sent as the timestamp, the first inbound body (or 'Self-report')
  // as the label.
  const bySession = new Map<string, { session_id: string; date_sent: string; label: string }>();
  for (const r of (rows ?? []) as Array<{
    session_id: string; body: string | null; direction: string; date_sent: string;
  }>) {
    const existing = bySession.get(r.session_id);
    if (!existing) {
      bySession.set(r.session_id, {
        session_id: r.session_id,
        date_sent: r.date_sent,
        label: r.direction === 'inbound' && r.body ? r.body : 'Self-report',
      });
      continue;
    }
    if (r.date_sent < existing.date_sent) existing.date_sent = r.date_sent;
    if (existing.label === 'Self-report' && r.direction === 'inbound' && r.body) {
      existing.label = r.body;
    }
  }

  const sessions = Array.from(bySession.values()).sort((a, b) =>
    a.date_sent < b.date_sent ? 1 : -1,
  );

  return NextResponse.json({ sessions });
}
