// POST /api/activity-logs
//
// Manual activity-log creation from the web (coach logging on behalf of
// an athlete, or athlete self-logging). Worker-driven inserts still go
// through the Twilio pipeline; this endpoint is for actions taken from
// the dashboard.
//
// Body:
//   { player_id: number, kind: 'workout' | 'rehab',
//     description: string, logged_at?: string, notes?: string }
//
// Auth:
//   - Caller must be an active member of the player's team.
//   - If logging for someone else (player_id != caller's linked
//     player), caller must be coach or platform admin.
//
// 'notes' is optional; when present it's appended to description as a
// distinct paragraph so coaches see it inline. The schema doesn't have
// a separate notes column today — keeping this in description keeps
// the timeline rendering simple. If we ever want notes hidden from the
// athlete view, we'll add a column.

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

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    player_id?: unknown;
    kind?: unknown;
    description?: unknown;
    logged_at?: unknown;
    notes?: unknown;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const playerId = Number(body.player_id);
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: 'bad_player_id' }, { status: 400 });
  }
  const kind = body.kind;
  if (kind !== 'workout' && kind !== 'rehab') {
    return NextResponse.json({ error: 'bad_kind' }, { status: 400 });
  }
  const descriptionRaw = typeof body.description === 'string' ? body.description.trim() : '';
  if (!descriptionRaw) {
    return NextResponse.json({ error: 'empty_description' }, { status: 400 });
  }
  if (descriptionRaw.length > 2000) {
    return NextResponse.json({ error: 'description_too_long' }, { status: 400 });
  }
  const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notesRaw.length > 1000) {
    return NextResponse.json({ error: 'notes_too_long' }, { status: 400 });
  }
  const description = notesRaw
    ? `${descriptionRaw}\n\nNotes for coach: ${notesRaw}`
    : descriptionRaw;

  // logged_at defaults to now. Accept ISO string; reject anything else.
  let loggedAt: string;
  if (body.logged_at == null) {
    loggedAt = new Date().toISOString();
  } else if (typeof body.logged_at === 'string' && !Number.isNaN(Date.parse(body.logged_at))) {
    loggedAt = new Date(body.logged_at).toISOString();
  } else {
    return NextResponse.json({ error: 'bad_logged_at' }, { status: 400 });
  }

  const sb = serviceClient();

  // Resolve the player + caller's membership in parallel.
  const [{ data: player }, { data: prefs }] = await Promise.all([
    sb.from('players').select('id, team_id').eq('id', playerId).maybeSingle<{ id: number; team_id: number }>(),
    sb.from('user_preferences')
      .select('impersonate_player_id, is_platform_admin')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ impersonate_player_id: number | null; is_platform_admin: boolean }>(),
  ]);
  if (!player) return NextResponse.json({ error: 'player_not_found' }, { status: 404 });

  const { data: mem } = await sb
    .from('team_memberships')
    .select('role, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', player.team_id)
    .maybeSingle<{ role: string; status: string }>();

  const isPlatformAdmin = prefs?.is_platform_admin === true;
  const isActiveMember = mem?.status === 'active';
  if (!isActiveMember && !isPlatformAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const isSelf = prefs?.impersonate_player_id === playerId;
  const isCoach = mem?.role === 'coach';
  if (!isSelf && !isCoach && !isPlatformAdmin) {
    return NextResponse.json(
      { error: 'forbidden', detail: 'Only coaches or admins can log activity for someone else.' },
      { status: 403 },
    );
  }

  const { data: row, error } = await sb
    .from('activity_logs')
    .insert({
      player_id: playerId,
      team_id: player.team_id,
      kind,
      description,
      logged_at: loggedAt,
      // source_sid stays null — that's how we tell manual entries apart
      // from worker-inserted Twilio rows in the timeline.
      source_sid: null,
      hidden: false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, log: row });
}
