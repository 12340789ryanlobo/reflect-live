// apps/web/src/app/api/self-report/[sessionId]/restore/route.ts
//
// Un-hide a previously soft-deleted self-report session. Exact inverse of
// the DELETE handler in ../route.ts: sets hidden=false on every
// twilio_messages row in the session AND any activity_logs that mirrored
// from those sids. Same auth.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { serviceClient } from '@/lib/supabase-server';
import { canDeleteActivityRow } from '@/lib/delete-permissions';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
    return NextResponse.json({ error: 'bad_session_id' }, { status: 400 });
  }

  const sb = serviceClient();

  // Find one row to authorize against. No hidden filter — the rows we're
  // restoring are currently hidden=true.
  const { data: rows } = await sb
    .from('twilio_messages')
    .select('sid, player_id, team_id')
    .eq('session_id', sessionId)
    .limit(1)
    .returns<Array<{ sid: string; player_id: number | null; team_id: number | null }>>();
  const sample = rows?.[0] ?? null;

  if (!sample) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (sample.player_id == null || sample.team_id == null) {
    return NextResponse.json({ error: 'unowned_row' }, { status: 409 });
  }

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
    rowPlayerId: sample.player_id,
    rowTeamId: sample.team_id,
  });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Un-hide all messages in the session.
  const { data: sessionRows, error: showErr } = await sb
    .from('twilio_messages')
    .update({ hidden: false })
    .eq('session_id', sessionId)
    .select('sid');
  if (showErr) {
    return NextResponse.json({ error: 'update_failed', detail: showErr.message }, { status: 500 });
  }

  // Reverse the cascade: un-hide any activity_logs mirrored from these sids.
  const sids = (sessionRows ?? []).map((r) => r.sid);
  if (sids.length) {
    const { error: cascadeErr } = await sb
      .from('activity_logs')
      .update({ hidden: false })
      .in('source_sid', sids);
    if (cascadeErr) {
      return NextResponse.json({ ok: true, cascade_warning: cascadeErr.message });
    }
  }

  return NextResponse.json({ ok: true, restored_rows: sids.length });
}
