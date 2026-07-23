// apps/web/src/app/api/activity-logs/[id]/restore/route.ts
//
// Un-hide a previously soft-deleted activity_logs row (set hidden=false).
// Exact inverse of the DELETE handler in ../route.ts; same auth.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { serviceClient } from '@/lib/supabase-server';
import { canDeleteActivityRow } from '@/lib/delete-permissions';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }

  const sb = serviceClient();

  const { data: row } = await sb
    .from('activity_logs')
    .select('player_id, team_id, source_sid')
    .eq('id', id)
    .maybeSingle<{ player_id: number; team_id: number; source_sid: string | null }>();
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

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
    rowPlayerId: row.player_id,
    rowTeamId: row.team_id,
  });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { error } = await sb
    .from('activity_logs')
    .update({ hidden: false })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }

  // Symmetric with DELETE: un-hide the paired source message so it returns to
  // being deduped behind the now-visible log rather than staying hidden.
  if (row.source_sid) {
    await sb.from('twilio_messages').update({ hidden: false }).eq('sid', row.source_sid);
  }

  return NextResponse.json({ ok: true });
}
