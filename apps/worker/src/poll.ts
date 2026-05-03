import type { SupabaseClient } from '@supabase/supabase-js';
import type { Twilio } from 'twilio';
import {
  extractDerivedInjuries,
  type DerivedInjury,
  type TwilioMessage,
} from '@reflect-live/shared';
import { PhoneCache } from './phone-cache';
import { toRow, type TwilioMessageLike } from './twilio-row';
import { getWorkerState, updateWorkerState } from './state';

export interface PollDeps {
  sb: SupabaseClient;
  twilio: Twilio;
  cache: PhoneCache;
  defaultTeamId: number;
  backfillDays: number;
}

export async function pollOnce(deps: PollDeps): Promise<number> {
  const { sb, twilio, cache, defaultTeamId, backfillDays } = deps;
  const state = await getWorkerState(sb);

  const cursor = state.last_date_sent
    ? new Date(state.last_date_sent)
    : new Date(Date.now() - backfillDays * 24 * 3600 * 1000);

  const msgs = await twilio.messages.list({
    dateSentAfter: cursor,
    pageSize: 1000,
  });

  if (msgs.length) {
    const rows = await Promise.all(
      msgs.map(async (m) => {
        // Twilio reports attachment count via numMedia (string). When > 0,
        // fetch the media list to get the SIDs. Each is one extra API
        // call per message-with-media; rate limit is generous.
        const numMedia = parseInt(m.numMedia ?? '0', 10);
        let mediaSids: string[] = [];
        if (numMedia > 0) {
          try {
            const media = await twilio.messages(m.sid).media.list();
            mediaSids = media.map((md) => md.sid);
          } catch (e) {
            console.error('[twilio] media list failed for %s: %s', m.sid, e instanceof Error ? e.message : String(e));
            // Don't fail the whole batch — ingest the message body
            // anyway, just without media references.
          }
        }
        return toRow(
          {
            sid: m.sid,
            direction: m.direction,
            from: m.from ?? null,
            to: m.to ?? null,
            body: m.body ?? null,
            status: m.status ?? null,
            dateSent: m.dateSent ?? new Date(),
            mediaSids,
          } as TwilioMessageLike,
          cache,
          defaultTeamId,
        );
      }),
    );
    const { error } = await sb.from('twilio_messages').upsert(rows, { onConflict: 'sid' });
    if (error) throw error;

    // Dual-write fitness activity into activity_logs so scoring stays in sync
    // without depending on a one-time bulk import from reflect's API. Idempotent
    // via source_sid unique index — the same SMS can't be inserted twice.
    const activityRows = rows
      .filter(
        (r) =>
          r.direction === 'inbound' &&
          (r.category === 'workout' || r.category === 'rehab') &&
          r.player_id !== null &&
          r.team_id !== null,
      )
      .map((r) => ({
        player_id: r.player_id as number,
        team_id: r.team_id as number,
        kind: r.category,
        description: r.body ?? '',
        // Mirror media_sids onto activity_logs so the past-activity feed
        // doesn't have to JOIN twilio_messages for thumbnail rendering.
        // image_path stays null — kept for legacy schema compat.
        image_path: null as string | null,
        media_sids: r.media_sids,
        logged_at: r.date_sent,
        source_sid: r.sid,
      }));
    if (activityRows.length) {
      const { error: actErr } = await sb
        .from('activity_logs')
        .upsert(activityRows, { onConflict: 'source_sid', ignoreDuplicates: true });
      if (actErr) throw actErr;
    }

    // Derive injury_reports rows from paired SMS Pain+body-area
    // exchanges. The athlete's standard reflect/sport-pulse check-in
    // already captures injury data implicitly (Pain=yes followed by
    // 'which body area is bothering you?'). Materialise it so the
    // heatmap injury tab + LLM player summary can read it as a real
    // injury list. Idempotent via injury_reports.source_sid unique
    // index — replaying the same body-area reply just upserts the
    // same row.
    //
    // Strategy: for each player who got a new message in this batch,
    // re-extract their last 30 days of survey data. Cheap (one query
    // per affected player) and handles the case where a session
    // straddled the previous poll cycle — the body-area reply might
    // have arrived in this batch but the pain question came in the
    // previous one.
    await refreshSurveyInjuries(sb, rows);

    const newest = msgs.reduce((acc, m) => {
      const t = m.dateSent?.getTime() ?? 0;
      return t > acc ? t : acc;
    }, 0);
    if (newest > 0) {
      await updateWorkerState(sb, { last_date_sent: new Date(newest).toISOString() });
    }
  }

  await updateWorkerState(sb, {
    last_twilio_poll_at: new Date().toISOString(),
    last_error: null,
    consecutive_errors: 0,
    backfill_complete: true,
  });

  return msgs.length;
}

// Re-run the SMS-survey injury extractor for every player whose
// messages just landed in this poll batch. Looks back 30 days so a
// session split across two poll cycles still pairs correctly.
async function refreshSurveyInjuries(
  sb: SupabaseClient,
  justUpserted: Array<{ player_id: number | null; team_id: number | null }>,
): Promise<void> {
  const affected = new Map<number, number>(); // player_id → team_id
  for (const r of justUpserted) {
    if (r.player_id != null && r.team_id != null) {
      affected.set(r.player_id, r.team_id);
    }
  }
  if (affected.size === 0) return;

  const SINCE = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  for (const [playerId, teamId] of affected) {
    const { data: msgs, error } = await sb
      .from('twilio_messages')
      .select('sid,direction,body,date_sent,player_id,team_id,from_number,to_number,status,category,media_sids')
      .eq('player_id', playerId)
      .gte('date_sent', SINCE)
      .order('date_sent', { ascending: true })
      .limit(2000);
    if (error) {
      console.error(`[injury] fetch failed for player ${playerId}: ${error.message}`);
      continue;
    }
    if (!msgs || msgs.length === 0) continue;
    const derived = extractDerivedInjuries(msgs as TwilioMessage[], playerId, teamId);
    if (derived.length === 0) continue;
    const injRows = derived.map((d: DerivedInjury) => ({
      player_id: d.player_id,
      team_id: d.team_id,
      regions: d.regions,
      severity: null as number | null,
      description: d.description,
      reported_at: d.reported_at,
      resolved_at: null as string | null,
      reported_by: 'survey:auto',
      source_sid: d.source_sid,
    }));
    const { error: upErr } = await sb
      .from('injury_reports')
      .upsert(injRows, { onConflict: 'source_sid' });
    if (upErr) {
      console.error(`[injury] upsert failed for player ${playerId}: ${upErr.message}`);
    }
  }
}
