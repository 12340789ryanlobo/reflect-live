// One-shot backfill: pull media SIDs from Twilio for every existing
// inbound twilio_messages row that doesn't yet have media_sids set.
// Mirrors onto activity_logs (matched by source_sid) when the message
// became a workout/rehab activity row.
//
// Worker is now capturing media on new messages (commit 2560fe5);
// this script catches up the historical rows.
//
// Run: bun run scripts/backfill-twilio-media.ts [--dry-run]
//
// Idempotent: only touches rows where media_sids IS NULL. Re-running
// after a partial run resumes from where it stopped. Twilio retains
// inbound media ~30 days — anything older returns 0 media (which we
// store as null and skip), so old messages are no-ops automatically.

import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { readFileSync } from 'fs';
import { join } from 'path';

const env = readFileSync(join(import.meta.dir, '..', 'apps', 'worker', '.env.local'), 'utf8');
const get = (k: string): string => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'));
  if (!m) throw new Error(`missing ${k}`);
  return m[1].trim();
};

const sb = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
const tw = twilio(get('TWILIO_ACCOUNT_SID'), get('TWILIO_AUTH_TOKEN'));

const DRY = process.argv.includes('--dry-run');
const PAGE = 200;
const SLEEP_MS = 50; // be polite to Twilio's API

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface Row {
  sid: string;
  direction: string;
  date_sent: string;
}

async function main() {
  console.log('=== twilio media backfill %s ===', DRY ? '(DRY RUN)' : '');

  // Page through every inbound twilio_messages row with media_sids IS NULL.
  // Always fetch from the top: each batch's UPDATE shrinks the result set
  // (rows now have media_sids set) so a fixed offset would skip un-
  // processed rows. Single-fetch-from-top means each iteration grabs the
  // next 200 still-NULL rows; loop terminates when 0 remain.
  let totalScanned = 0;
  let totalWithMedia = 0;
  let totalEmpty = 0;
  let totalFailed = 0;
  let totalActivityMirrored = 0;

  while (true) {
    const { data: rows, error } = await sb
      .from('twilio_messages')
      .select('sid, direction, date_sent')
      .is('media_sids', null)
      .eq('direction', 'inbound')
      .order('date_sent', { ascending: false })
      .limit(PAGE);
    if (error) throw error;
    const batch = (rows ?? []) as Row[];
    if (batch.length === 0) break;

    for (const r of batch) {
      totalScanned += 1;
      let mediaSids: string[] = [];
      try {
        const list = await tw.messages(r.sid).media.list();
        mediaSids = list.map((m) => m.sid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 404 (message expired off Twilio) and 401/403 (perms) are normal
        // for old messages. Log + skip; we leave media_sids null so it's
        // not retried infinitely. (Re-runs of this script also skip.)
        const code = (e as { status?: number }).status;
        if (code === 404 || code === 401 || code === 403) {
          totalEmpty += 1;
        } else {
          console.warn('[%s] media.list failed: %s', r.sid, msg);
          totalFailed += 1;
        }
        if (!DRY) {
          // Stamp empty array so we don't re-scan this row next run.
          // Distinguishable from genuine no-media-ever in that the row
          // was created before the new pipeline existed, but functionally
          // equivalent: nothing to render.
          await sb.from('twilio_messages').update({ media_sids: [] }).eq('sid', r.sid);
        }
        await sleep(SLEEP_MS);
        continue;
      }

      if (mediaSids.length === 0) {
        totalEmpty += 1;
        if (!DRY) {
          await sb.from('twilio_messages').update({ media_sids: [] }).eq('sid', r.sid);
        }
        await sleep(SLEEP_MS);
        continue;
      }

      totalWithMedia += 1;
      console.log('[%s] %d media · %s', r.sid, mediaSids.length, r.date_sent);

      if (!DRY) {
        const { error: msgErr } = await sb
          .from('twilio_messages')
          .update({ media_sids: mediaSids })
          .eq('sid', r.sid);
        if (msgErr) {
          console.warn('  twilio_messages update failed: %s', msgErr.message);
          totalFailed += 1;
        }

        // Mirror onto the activity_logs row that was created from this
        // message (worker dual-writes via source_sid for workout/rehab).
        // Idempotent: just set if currently null.
        const { error: actErr, count } = await sb
          .from('activity_logs')
          .update({ media_sids: mediaSids }, { count: 'exact' })
          .eq('source_sid', r.sid)
          .is('media_sids', null);
        if (actErr) {
          console.warn('  activity_logs mirror failed: %s', actErr.message);
        } else if (count && count > 0) {
          totalActivityMirrored += count;
        }
      }

      await sleep(SLEEP_MS);
    }

    console.log(
      '  progress: scanned=%d  with_media=%d  empty=%d  failed=%d  activity_mirrored=%d',
      totalScanned, totalWithMedia, totalEmpty, totalFailed, totalActivityMirrored,
    );
  }

  console.log('=== done ===');
  console.log('  scanned:           %d', totalScanned);
  console.log('  with media:        %d', totalWithMedia);
  console.log('  empty (no media):  %d', totalEmpty);
  console.log('  failed:            %d', totalFailed);
  console.log('  activity mirrored: %d', totalActivityMirrored);
  if (DRY) {
    console.log('\n(DRY RUN — no rows updated. Re-run without --dry-run to apply.)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
