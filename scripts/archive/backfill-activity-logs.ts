// One-time backfill: copy historical SMS-tagged workouts/rehabs from
// twilio_messages into activity_logs so the leaderboard reflects everything
// the team has ever logged via SMS — not just whatever a one-shot reflect-API
// import captured.
//
// Idempotent via activity_logs.source_sid unique index. Re-runs are a no-op
// for rows already imported. Hidden rows are NEVER resurrected because the
// source_sid match counts as a duplicate.
//
// Run: bun run scripts/backfill-activity-logs.ts [--dry-run]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const env = readFileSync(join(import.meta.dir, '..', 'apps', 'worker', '.env.local'), 'utf8');
const get = (k: string): string => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'));
  if (!m) throw new Error(`missing ${k}`);
  return m[1].trim();
};
const sb = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const DRY = process.argv.includes('--dry-run');

async function main() {
  let scanned = 0;
  let imported = 0;
  let skipped = 0;
  const batchSize = 1000;
  let lastSid = '';

  while (true) {
    let q = sb
      .from('twilio_messages')
      .select('sid,player_id,team_id,category,body,date_sent')
      .eq('direction', 'inbound')
      .in('category', ['workout', 'rehab'])
      .not('player_id', 'is', null)
      .order('sid', { ascending: true })
      .limit(batchSize);
    if (lastSid) q = q.gt('sid', lastSid);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    const rows = data.map((m) => ({
      player_id: m.player_id as number,
      team_id: m.team_id as number,
      kind: m.category as 'workout' | 'rehab',
      description: (m.body as string | null) ?? '',
      image_path: null,
      logged_at: m.date_sent as string,
      source_sid: m.sid as string,
    }));
    scanned += rows.length;

    if (!DRY && rows.length) {
      const { data: inserted, error: insErr } = await sb
        .from('activity_logs')
        .upsert(rows, { onConflict: 'source_sid', ignoreDuplicates: true })
        .select('id');
      if (insErr) throw insErr;
      const n = inserted?.length ?? 0;
      imported += n;
      skipped += rows.length - n;
      console.log(`  batch: scanned=${rows.length} imported=${n} skipped=${rows.length - n}`);
    } else if (DRY) {
      console.log(`  batch: scanned=${rows.length} (dry — not inserted)`);
    }

    lastSid = data[data.length - 1].sid as string;
    if (data.length < batchSize) break;
  }

  console.log(`\nscanned: ${scanned}`);
  console.log(`imported: ${imported}`);
  console.log(`skipped (already present): ${skipped}`);
  console.log(DRY ? 'DRY RUN — no rows inserted' : 'updates applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
