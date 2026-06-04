// DELETE /api/self-report/[sessionId]
//
// Hides every twilio_messages row in the named session. Soft delete —
// the rows survive in the DB with hidden=true. Recovery via SQL only;
// no Restore UI in v1.
//
// Permission: the linked athlete (impersonate_player_id == player_id of
// the session's rows) OR a coach/admin on the row's team. Platform
// admins bypass the team check. Shared with the activity-logs DELETE
// endpoint via lib/delete-permissions.
//
// Cascade: any activity_logs rows that mirrored from this session's
// sids are also hidden. Defensive — self-reports are category='survey'
// so the worker's dual-write shouldn't have created any, but a future
// change to that filter could.

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

export async function DELETE(
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

  // Find one row to authorize against (every row in the session shares
  // player_id + team_id by construction in /api/self-report).
  const { data: sample } = await sb
    .from('twilio_messages')
    .select('sid, player_id, team_id')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle<{ sid: string; player_id: number | null; team_id: number | null }>();

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

  // Hide all messages in the session.
  const { data: sessionRows, error: hideErr } = await sb
    .from('twilio_messages')
    .update({ hidden: true })
    .eq('session_id', sessionId)
    .select('sid');
  if (hideErr) {
    return NextResponse.json({ error: 'update_failed', detail: hideErr.message }, { status: 500 });
  }

  // Cascade to any activity_logs that mirrored from these sids.
  const sids = (sessionRows ?? []).map((r) => r.sid);
  if (sids.length) {
    const { error: cascadeErr } = await sb
      .from('activity_logs')
      .update({ hidden: true })
      .in('source_sid', sids);
    if (cascadeErr) {
      // Cascade failure is non-fatal — the self-report rows are hidden;
      // the mirror would normally not exist anyway. Log via response.
      return NextResponse.json({ ok: true, cascade_warning: cascadeErr.message });
    }
  }

  return NextResponse.json({ ok: true, hidden_rows: sids.length });
}
