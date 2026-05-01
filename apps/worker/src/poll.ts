import type { SupabaseClient } from '@supabase/supabase-js';
import type { Twilio } from 'twilio';
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
