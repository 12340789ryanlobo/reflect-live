// Survey scheduler — runs every minute. Picks up scheduled_sends rows that
// are due (scheduled_at <= now, status=pending), expands the audience,
// freezes each session's question snapshot via the SurveyEngine, and either:
//
//   - sends via Twilio (when TWILIO_OUTBOUND_ENABLED=true), or
//   - logs a row to dry_run_log (default: shadow mode)
//
// Either way the scheduled_sends row is marked sent_at=now and status='sent'
// once we've consumed it. The dry_run_log row carries the body preview and
// would_block_reason so the daily diff against reflect's actual sends has
// something to compare.
//
// Reminders for in-flight deliveries are a separate concern — handled by
// the reminder loop in this same module.

import type { SupabaseClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { SurveyEngine } from '@reflect-live/shared';

interface ScheduledSendRow {
  id: number;
  session_id: number;
  scheduled_at: string;
  group_filter: string | null;
  player_ids_json: number[] | null;
  channel: 'whatsapp' | 'sms';
}

interface PlayerRow {
  id: number;
  team_id: number;
  phone_e164: string;
  group: string | null;
  active: boolean;
}

const REMINDER_AGE_MS = Number(process.env.SURVEY_REMINDER_AGE_MS ?? 4 * 60 * 60 * 1000);
const OUTBOUND_ENABLED = process.env.TWILIO_OUTBOUND_ENABLED === 'true';

/**
 * Resolve the audience for a scheduled send. Order of precedence:
 *   1. Explicit player_ids_json (admin-curated list)
 *   2. group_filter — match against players.group OR a tag in players.group_tags
 *   3. fallback: every active player on the session's team
 */
async function resolveAudience(
  sb: SupabaseClient,
  send: ScheduledSendRow,
  teamId: number,
): Promise<PlayerRow[]> {
  if (Array.isArray(send.player_ids_json) && send.player_ids_json.length > 0) {
    const { data } = await sb
      .from('players')
      .select('id, team_id, phone_e164, group, active')
      .in('id', send.player_ids_json)
      .eq('active', true);
    return (data ?? []) as PlayerRow[];
  }

  let q = sb.from('players').select('id, team_id, phone_e164, group, active, group_tags')
    .eq('team_id', teamId)
    .eq('active', true);
  if (send.group_filter) {
    // group is the legacy single-value column; group_tags is the multi-tag
    // array. We match either so coaches don't have to migrate.
    q = q.or(`group.eq.${send.group_filter},group_tags.cs.{${send.group_filter}}`);
  }
  const { data } = await q;
  return (data ?? []) as PlayerRow[];
}

interface DispatchOutcome {
  ok: boolean;
  sid: string | null;
  blockReason: string | null;
  error: string | null;
}

/**
 * Send a single message OR record a dry-run entry. Always returns success
 * info; the caller decides what to write back to scheduled_sends and
 * deliveries based on this. We never throw — outbound failures shouldn't
 * crash the loop, just get logged into dry_run_log with diff_status.
 */
async function dispatch(
  sb: SupabaseClient,
  tw: ReturnType<typeof twilio>,
  channel: 'whatsapp' | 'sms',
  to: string,
  body: string,
  ctx: { team_id: number; session_id: number; player_id: number; scheduled_at: string },
): Promise<DispatchOutcome> {
  const from = channel === 'whatsapp'
    ? process.env.TWILIO_WHATSAPP_FROM
    : process.env.TWILIO_PHONE_NUMBER;

  if (!OUTBOUND_ENABLED) {
    await sb.from('dry_run_log').insert({
      team_id: ctx.team_id,
      session_id: ctx.session_id,
      player_id: ctx.player_id,
      scheduled_at: ctx.scheduled_at,
      channel,
      body_preview: body.slice(0, 800),
      would_block_reason: 'shadow_mode',
      diff_status: null,
    });
    return { ok: true, sid: null, blockReason: 'shadow_mode', error: null };
  }

  if (!from) {
    await sb.from('dry_run_log').insert({
      team_id: ctx.team_id,
      session_id: ctx.session_id,
      player_id: ctx.player_id,
      scheduled_at: ctx.scheduled_at,
      channel,
      body_preview: body.slice(0, 800),
      would_block_reason: `missing_from_${channel}`,
      diff_status: null,
    });
    return { ok: false, sid: null, blockReason: `missing_from_${channel}`, error: null };
  }

  try {
    const toAddr = channel === 'whatsapp' ? `whatsapp:${to}` : to;
    const fromAddr = channel === 'whatsapp' && !from.startsWith('whatsapp:')
      ? `whatsapp:${from}` : from;
    const msg = await tw.messages.create({ to: toAddr, from: fromAddr, body });
    return { ok: true, sid: msg.sid, blockReason: null, error: null };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await sb.from('dry_run_log').insert({
      team_id: ctx.team_id,
      session_id: ctx.session_id,
      player_id: ctx.player_id,
      scheduled_at: ctx.scheduled_at,
      channel,
      body_preview: body.slice(0, 800),
      would_block_reason: `twilio_error:${err.slice(0, 200)}`,
      diff_status: null,
    });
    return { ok: false, sid: null, blockReason: null, error: err };
  }
}

/**
 * Process all due scheduled_sends. Each send claims its row by stamping
 * processing_at, runs through audience expansion + dispatch, then marks
 * the row as sent (or failed if the audience was empty / first-question
 * resolution failed).
 *
 * Returns counts so the index loop can log progress.
 */
export async function pollScheduledSends(
  sb: SupabaseClient,
  tw: ReturnType<typeof twilio>,
): Promise<{ processed: number; dispatched: number; errors: number }> {
  const now = new Date().toISOString();
  const { data: dueRaw } = await sb
    .from('scheduled_sends')
    .select('id, session_id, scheduled_at, group_filter, player_ids_json, channel')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .is('processing_at', null)
    .limit(50);
  const due = (dueRaw ?? []) as ScheduledSendRow[];
  if (due.length === 0) return { processed: 0, dispatched: 0, errors: 0 };

  const engine = new SurveyEngine(sb);
  let dispatched = 0;
  let errors = 0;

  for (const send of due) {
    // Claim this row so a concurrent worker (in case we ever scale) can't
    // double-process it.
    const { data: claimed } = await sb
      .from('scheduled_sends')
      .update({ processing_at: new Date().toISOString() })
      .eq('id', send.id)
      .eq('status', 'pending')
      .is('processing_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    try {
      const { data: session } = await sb
        .from('sessions')
        .select('team_id, deleted_at')
        .eq('id', send.session_id)
        .maybeSingle();
      if (!session || session.deleted_at) {
        await sb.from('scheduled_sends')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'session_missing_or_deleted' })
          .eq('id', send.id);
        continue;
      }

      const audience = await resolveAudience(sb, send, session.team_id);
      if (audience.length === 0) {
        await sb.from('scheduled_sends')
          .update({ status: 'failed', error_message: 'no_audience', sent_at: new Date().toISOString() })
          .eq('id', send.id);
        continue;
      }

      const firstQ = await engine.getFirstQuestionTextForSession(send.session_id);
      if (!firstQ) {
        await sb.from('scheduled_sends')
          .update({ status: 'failed', error_message: 'no_questions', sent_at: new Date().toISOString() })
          .eq('id', send.id);
        continue;
      }

      for (const p of audience) {
        await engine.startDelivery(send.session_id, p.id);
        const outcome = await dispatch(sb, tw, send.channel, p.phone_e164, firstQ, {
          team_id: session.team_id,
          session_id: send.session_id,
          player_id: p.id,
          scheduled_at: send.scheduled_at,
        });
        if (outcome.ok) dispatched += 1;
        else errors += 1;
      }

      await sb.from('scheduled_sends')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', send.id);
    } catch (e) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from('scheduled_sends')
        .update({ status: 'failed', error_message: msg.slice(0, 500), sent_at: new Date().toISOString() })
        .eq('id', send.id);
    }
  }

  return { processed: due.length, dispatched, errors };
}

interface DeliveryRowLite {
  id: number;
  session_id: number;
  player_id: number;
  started_at: string;
  current_q_idx: number;
}

/**
 * Pick up in-progress deliveries that have been idle for REMINDER_AGE_MS
 * with no reminder yet and nudge the athlete with the question they're
 * stuck on. One reminder per delivery — reminder_sent_at acts as the
 * idempotency lock.
 */
export async function pollReminders(
  sb: SupabaseClient,
  tw: ReturnType<typeof twilio>,
): Promise<{ processed: number; errors: number }> {
  const cutoff = new Date(Date.now() - REMINDER_AGE_MS).toISOString();
  const { data: rows } = await sb
    .from('deliveries')
    .select('id, session_id, player_id, started_at, current_q_idx')
    .eq('status', 'in_progress')
    .is('reminder_sent_at', null)
    .lt('started_at', cutoff)
    .limit(50);
  const due = (rows ?? []) as DeliveryRowLite[];
  if (due.length === 0) return { processed: 0, errors: 0 };

  const engine = new SurveyEngine(sb);
  let errors = 0;

  for (const d of due) {
    try {
      const q = await engine.getQuestionForSessionProgress(d.session_id, d.current_q_idx);
      if (!q) continue;
      const { data: player } = await sb
        .from('players')
        .select('phone_e164, team_id')
        .eq('id', d.player_id)
        .maybeSingle<{ phone_e164: string; team_id: number }>();
      if (!player) continue;
      const { data: send } = await sb
        .from('scheduled_sends')
        .select('channel, scheduled_at')
        .eq('session_id', d.session_id)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ channel: 'whatsapp' | 'sms'; scheduled_at: string }>();
      const channel = send?.channel ?? 'whatsapp';

      const body = `Quick reminder — still need your reply:\n\n${q.text}`;
      const outcome = await dispatch(sb, tw, channel, player.phone_e164, body, {
        team_id: player.team_id,
        session_id: d.session_id,
        player_id: d.player_id,
        scheduled_at: send?.scheduled_at ?? new Date().toISOString(),
      });
      if (!outcome.ok) errors += 1;

      await sb.from('deliveries').update({ reminder_sent_at: new Date().toISOString() }).eq('id', d.id);
    } catch (e) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[reminders] error on delivery %d: %s', d.id, msg);
    }
  }

  return { processed: due.length, errors };
}
