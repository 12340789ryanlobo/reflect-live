// POST /api/self-report
//
// Web equivalent of an athlete's inbound SMS readiness reply. Inserts a
// synthetic row into twilio_messages with direction='inbound' and
// category='survey', so the existing readiness parser on the athlete
// hero picks it up automatically — no schema change, no second code
// path to maintain.
//
// Body: { player_id: number, readiness: 1-10, notes?: string }
//
// Auth: caller must be the athlete linked to player_id (i.e.
// prefs.impersonate_player_id === player_id). Coaches can't self-report
// on behalf — by definition that's not "self".
//
// Dedup: a fresh `web-self-<uuid>` sid per call. The sid is the
// twilio_messages PK, so collisions can't happen.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

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

  let body: { player_id?: unknown; readiness?: unknown; notes?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const playerId = Number(body.player_id);
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: 'bad_player_id' }, { status: 400 });
  }
  const readiness = Number(body.readiness);
  if (!Number.isInteger(readiness) || readiness < 1 || readiness > 10) {
    return NextResponse.json({ error: 'bad_readiness', detail: 'readiness must be 1-10' }, { status: 400 });
  }
  const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notesRaw.length > 500) {
    return NextResponse.json({ error: 'notes_too_long' }, { status: 400 });
  }

  const sb = serviceClient();

  // Auth: must be the athlete linked to the player. Anyone with
  // impersonate_player_id === playerId qualifies (athlete, captain
  // who's also on the roster, etc.). Platform admins are excluded —
  // they shouldn't fake a self-report on someone else's behalf.
  const [{ data: prefs }, { data: player }] = await Promise.all([
    sb.from('user_preferences')
      .select('impersonate_player_id, is_platform_admin')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ impersonate_player_id: number | null; is_platform_admin: boolean }>(),
    sb.from('players').select('id, team_id, phone_e164').eq('id', playerId).maybeSingle<{ id: number; team_id: number; phone_e164: string | null }>(),
  ]);
  if (!player) return NextResponse.json({ error: 'player_not_found' }, { status: 404 });
  if (prefs?.is_platform_admin === true) {
    return NextResponse.json(
      { error: 'forbidden', detail: "Platform admins can't self-report on behalf of an athlete." },
      { status: 403 },
    );
  }
  if (prefs?.impersonate_player_id !== playerId) {
    return NextResponse.json(
      { error: 'forbidden', detail: 'Self-report requires being linked to this athlete.' },
      { status: 403 },
    );
  }

  // Match the SMS body shape the readiness parser expects: leading
  // 1-2 digit number, optional space-prefixed free-text afterwards.
  const messageBody = notesRaw ? `${readiness} ${notesRaw}` : `${readiness}`;
  const nowIso = new Date().toISOString();
  const sid = `web-self-${randomUUID()}`;

  const { error } = await sb
    .from('twilio_messages')
    .insert({
      sid,
      direction: 'inbound',
      // from_number is the athlete's phone if we have it (so the row
      // looks like the SMS path); to_number stays null since this
      // didn't actually go through Twilio's PN.
      from_number: player.phone_e164 ?? null,
      to_number: null,
      body: messageBody,
      status: 'received',
      category: 'survey',
      date_sent: nowIso,
      player_id: playerId,
      team_id: player.team_id,
      ingested_at: nowIso,
    });
  if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, sid, readiness });
}
