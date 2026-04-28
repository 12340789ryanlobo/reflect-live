// One-time backfill: re-resolve player_id for twilio_messages rows where
// the worker previously failed to match a player. Cause: WhatsApp messages
// arrive with from/to like "whatsapp:+1...", and the original cache lookup
// did an exact-equals against players.phone_e164 (which has no prefix).
// Worker is now fixed (apps/worker/src/twilio-row.ts) but historical rows
// need updating.
//
// Run: bun run scripts/backfill-twilio-player-id.ts [--dry-run]
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

function normalizePhone(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/^(whatsapp|sms):/i, '');
}

async function main() {
  const { data: players } = await sb.from('players').select('id,team_id,phone_e164');
  const phoneToPlayer = new Map<string, { id: number; team_id: number }>();
  for (const p of players ?? []) {
    phoneToPlayer.set(p.phone_e164 as string, { id: p.id as number, team_id: p.team_id as number });
  }
  console.log(`loaded ${phoneToPlayer.size} players`);

  // Page through every twilio_messages row with null player_id
  let scanned = 0;
  let resolved = 0;
  let stillUnresolved = 0;
  const batchSize = 1000;
  let lastSid = '';

  while (true) {
    const q = sb
      .from('twilio_messages')
      .select('sid,direction,from_number,to_number,player_id,team_id')
      .is('player_id', null)
      .order('sid', { ascending: true })
      .limit(batchSize);
    if (lastSid) q.gt('sid', lastSid);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    const updates: Array<{ sid: string; player_id: number; team_id: number }> = [];
    for (const row of data) {
      scanned += 1;
      const raw = row.direction === 'inbound' ? row.from_number : row.to_number;
      const phone = normalizePhone(raw as string | null);
      const ref = phone ? phoneToPlayer.get(phone) : undefined;
      if (ref) {
        updates.push({ sid: row.sid, player_id: ref.id, team_id: ref.team_id });
        resolved += 1;
      } else {
        stillUnresolved += 1;
      }
    }

    if (updates.length > 0) {
      console.log(`  batch: ${updates.length} resolved (of ${data.length} scanned)`);
      if (!DRY) {
        // Update one row at a time — supabase-js doesn't support bulk-update
        // by primary key in a single call without an upsert (which would
        // overwrite all columns). For ~1000 rows per batch this is fine.
        for (const u of updates) {
          const { error: uerr } = await sb
            .from('twilio_messages')
            .update({ player_id: u.player_id, team_id: u.team_id })
            .eq('sid', u.sid);
          if (uerr) {
            console.error(`  error updating ${u.sid}:`, uerr.message);
          }
        }
      }
    }

    lastSid = data[data.length - 1].sid;
    if (data.length < batchSize) break;
  }

  console.log(`\nscanned: ${scanned}`);
  console.log(`resolved: ${resolved}`);
  console.log(`still unresolved: ${stillUnresolved}  (numbers not in players table)`);
  console.log(DRY ? 'DRY RUN — no rows updated' : 'updates applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
