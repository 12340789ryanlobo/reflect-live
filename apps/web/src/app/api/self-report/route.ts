// POST /api/self-report
//
// Web equivalent of an athlete's inbound replies. Writes synthetic
// rows into twilio_messages so survey-trends + the readiness parser
// pick them up automatically — no schema change, no second code path.
//
// Two body shapes accepted:
//   1. Legacy quick check-in: { player_id, readiness: 1-10, notes? }
//      → 1 inbound row, body shaped like an SMS readiness reply.
//   2. Multi-question (questions pulled from recent sessions):
//      { player_id, answers: Array<{ question_id, question_text, answer_text, answer_num? }> }
//      → For each answer we write 2 rows: outbound with the question
//        text (prefixed with '[Self-report]' so normalizeQuestion
//        strips it the same way it strips the SMS bot's
//        '[Session - Date]' prefix) and inbound with the answer body.
//        The survey-trends pairer matches them in-order within the
//        burst and the answer flows into the same metric bucket as
//        the real SMS path.
//
// Auth: caller must be the athlete linked to player_id (i.e.
// prefs.impersonate_player_id === player_id). Coaches can't self-report
// on behalf — by definition that's not "self".

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

interface AnswerInput {
  question_id?: unknown;
  question_text?: unknown;
  answer_text?: unknown;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { player_id?: unknown; readiness?: unknown; notes?: unknown; answers?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const playerId = Number(body.player_id);
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: 'bad_player_id' }, { status: 400 });
  }

  // Detect mode. answers[] (multi-question) takes precedence over
  // legacy readiness; if neither is provided, reject.
  const isMulti = Array.isArray(body.answers) && (body.answers as unknown[]).length > 0;

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

  // ─── Multi-question path ─────────────────────────────────────────
  if (isMulti) {
    const answers = body.answers as AnswerInput[];
    interface Pair { qBody: string; aBody: string }
    const pairs: Pair[] = [];
    for (const a of answers) {
      const qid = String(a.question_id ?? '').trim();
      const qtext = String(a.question_text ?? '').trim();
      const atext = String(a.answer_text ?? '').trim();
      if (!qid || !qtext) continue; // malformed entry — skip
      if (!atext) continue;          // skipped question — don't emit a pair
      if (qtext.length > 500 || atext.length > 500) {
        return NextResponse.json({ error: 'answer_too_long' }, { status: 400 });
      }
      pairs.push({
        // [Self-report] prefix is stripped by normalizeQuestion's
        // `^\[…\]\s*` rule, same as the SMS bot's [Session - Date]
        // prefix. So both paths land in the same metric bucket.
        qBody: `[Self-report] ${qtext}`,
        aBody: atext,
      });
    }
    if (pairs.length === 0) {
      return NextResponse.json({ error: 'no_answers', detail: 'submit at least one answer' }, { status: 400 });
    }

    // Time-stagger 1s apart so the survey-trends in-order pairer
    // (question[i] ↔ reply[i]) gets stable, deterministic ordering
    // within the burst.
    const baseMs = Date.now();
    const rows: Array<Record<string, unknown>> = [];
    pairs.forEach((p, i) => {
      const tsQ = new Date(baseMs + i * 2000).toISOString();
      const tsA = new Date(baseMs + i * 2000 + 500).toISOString();
      rows.push({
        sid: `web-self-q-${randomUUID()}`,
        direction: 'outbound-api',
        from_number: null,
        to_number: player.phone_e164 ?? null,
        body: p.qBody,
        status: 'sent',
        category: 'survey',
        date_sent: tsQ,
        player_id: playerId,
        team_id: player.team_id,
        ingested_at: tsQ,
      });
      rows.push({
        sid: `web-self-a-${randomUUID()}`,
        direction: 'inbound',
        from_number: player.phone_e164 ?? null,
        to_number: null,
        body: p.aBody,
        status: 'received',
        category: 'survey',
        date_sent: tsA,
        player_id: playerId,
        team_id: player.team_id,
        ingested_at: tsA,
      });
    });

    const { error } = await sb.from('twilio_messages').insert(rows);
    if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, answered: pairs.length });
  }

  // ─── Legacy quick-readiness path ─────────────────────────────────
  const readiness = Number(body.readiness);
  if (!Number.isInteger(readiness) || readiness < 1 || readiness > 10) {
    return NextResponse.json({ error: 'bad_readiness', detail: 'readiness must be 1-10' }, { status: 400 });
  }
  const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notesRaw.length > 500) {
    return NextResponse.json({ error: 'notes_too_long' }, { status: 400 });
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
