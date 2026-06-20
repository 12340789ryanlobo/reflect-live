// apps/web/src/app/api/twilio-messages/[sid]/route.ts
//
// Soft-delete a single twilio_messages row (a real SMS / chat / survey
// answer) that has no session_id. These are the timeline entries the
// athlete page otherwise can't delete — only web self-reports carry a
// session_id, so the self-report DELETE path bailed on real SMS rows.
//
// To reuse the self-report restore + trash machinery, we stamp a
// synthetic session_id of the form `adhoc-<sid>` on the row(s) being
// hidden, so they group, list in "Recently deleted", and restore through
// /api/self-report/[sessionId] exactly like a web self-report session.
//
// An optional ?paired_sid= lets the timeline also hide the outbound
// question that renders inline with an inbound survey answer (the same
// render-time pairing the UI shows), so a deleted answer doesn't leave
// its question dangling as a standalone row.
//
// Durability: hidden + session_id survive the worker poll — the worker's
// upsert payload (twilio-row.ts MessageRow) omits both columns, so
// ON CONFLICT DO UPDATE preserves them.

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
  req: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { sid } = await params;
  if (!sid || typeof sid !== 'string' || sid.length > 100) {
    return NextResponse.json({ error: 'bad_sid' }, { status: 400 });
  }
  const pairedSid = req.nextUrl.searchParams.get('paired_sid');

  const sb = serviceClient();

  // Collect the target rows (clicked + optional paired question) so we
  // can authorize against the owning player/team and confirm they belong
  // to the same player before grouping them.
  const sids = pairedSid && pairedSid !== sid ? [sid, pairedSid] : [sid];
  const { data: rows } = await sb
    .from('twilio_messages')
    .select('sid, player_id, team_id, session_id')
    .in('sid', sids)
    .returns<Array<{ sid: string; player_id: number | null; team_id: number | null; session_id: string | null }>>();

  const clicked = rows?.find((r) => r.sid === sid) ?? null;
  if (!clicked) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (clicked.player_id == null || clicked.team_id == null) {
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
    rowPlayerId: clicked.player_id,
    rowTeamId: clicked.team_id,
  });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Only group rows that belong to the same player and don't already
  // carry a session_id (a row that already has one goes through the
  // self-report path instead — don't clobber a real session).
  const groupSids = (rows ?? [])
    .filter((r) => r.player_id === clicked.player_id && r.session_id == null)
    .map((r) => r.sid);
  if (groupSids.length === 0) {
    return NextResponse.json({ error: 'already_grouped' }, { status: 409 });
  }

  // Synthetic session_id keyed to the clicked sid (deterministic, so a
  // re-delete reuses the same group). Lets the self-report restore + trash
  // endpoints handle these unchanged.
  const sessionId = `adhoc-${sid}`;
  const { error: hideErr } = await sb
    .from('twilio_messages')
    .update({ hidden: true, session_id: sessionId })
    .in('sid', groupSids);
  if (hideErr) {
    return NextResponse.json({ error: 'update_failed', detail: hideErr.message }, { status: 500 });
  }

  // Defensive cascade: hide any activity_logs mirrored from these sids
  // (mirrors the self-report DELETE cascade).
  const { error: cascadeErr } = await sb
    .from('activity_logs')
    .update({ hidden: true })
    .in('source_sid', groupSids);
  if (cascadeErr) {
    return NextResponse.json({ ok: true, session_id: sessionId, cascade_warning: cascadeErr.message });
  }

  return NextResponse.json({ ok: true, session_id: sessionId, hidden_rows: groupSids.length });
}
