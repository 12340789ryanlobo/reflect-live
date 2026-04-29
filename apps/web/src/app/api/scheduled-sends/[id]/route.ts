// PATCH /api/scheduled-sends/:id
//
// Coaches/captains/admins can cancel a pending scheduled_send before
// the worker fires it. Once status flips to 'cancelled' the worker
// scheduler skips the row.
//
// Body shape: { cancel: true, reason?: string }

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
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: { cancel?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const sb = serviceClient();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('team_id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref) return NextResponse.json({ error: 'no_team' }, { status: 403 });
  const role = (pref.role ?? 'coach') as string;
  if (!['coach', 'captain', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Verify the send belongs to a session on the user's team.
  const { data: send } = await sb
    .from('scheduled_sends')
    .select('id, status, session_id, sessions!inner(team_id)')
    .eq('id', id)
    .maybeSingle<{ id: number; status: string; session_id: number; sessions: { team_id: number } }>();
  if (!send) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (send.sessions.team_id !== pref.team_id) {
    return NextResponse.json({ error: 'wrong_team' }, { status: 403 });
  }

  if (body.cancel === true) {
    if (send.status !== 'pending') {
      return NextResponse.json({ error: 'not_pending', status: send.status }, { status: 400 });
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null;
    const { data, error } = await sb
      .from('scheduled_sends')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, scheduled_send: data });
  }

  return NextResponse.json({ error: 'no_op' }, { status: 400 });
}
