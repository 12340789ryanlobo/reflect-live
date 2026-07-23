// Print Ryan's full message flow chronologically so we can see WHY
// numeric replies are getting paired with text-only questions.
// Hypothesis: our "most recent outbound question within 24h" logic
// is matching replies to the wrong question in a multi-question survey.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('apps/web/.env.local', 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const k = trimmed.slice(0, eq);
  let v = trimmed.slice(eq + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

const playerId = Number(process.argv[2] ?? 46);

const { data: msgs } = await sb
  .from('twilio_messages')
  .select('sid,direction,body,date_sent')
  .eq('player_id', playerId)
  .order('date_sent', { ascending: true })
  .limit(2000);

if (!msgs || msgs.length === 0) {
  console.log('no messages');
  process.exit(0);
}

console.log(`=== Player #${playerId} chronological flow (${msgs.length} msgs) ===\n`);

let prevTs = 0;
for (const m of msgs) {
  const ts = new Date(m.date_sent).getTime();
  const gap = prevTs ? Math.round((ts - prevTs) / 60000) : 0; // minutes
  prevTs = ts;
  const dir = m.direction === 'inbound' ? '◀ IN ' : '▶ OUT';
  const body = (m.body ?? '').replace(/\s+/g, ' ').slice(0, 90);
  const date = m.date_sent.replace('T', ' ').slice(0, 16);
  const gapStr = gap > 0 ? `+${gap}m` : '    ';
  console.log(`${date} ${gapStr.padStart(5)} ${dir} ${body}`);
}
