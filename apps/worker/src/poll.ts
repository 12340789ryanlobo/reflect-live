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
      msgs.map((m) =>
        toRow(
          {
            sid: m.sid,
            direction: m.direction,
            from: m.from ?? null,
            to: m.to ?? null,
            body: m.body ?? null,
            status: m.status ?? null,
            dateSent: m.dateSent ?? new Date(),
          } as TwilioMessageLike,
          cache,
          defaultTeamId,
        ),
      ),
    );
    const { error } = await sb.from('twilio_messages').upsert(rows, { onConflict: 'sid' });
    if (error) throw error;

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
