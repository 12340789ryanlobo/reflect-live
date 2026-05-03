// Compare reflect-live's injury_reports for Ryan Lobo with what
// reflect's prod API returns, to find the source of the discrepancy
// (7 here vs 5 there).

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

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// Diagnose 7 vs 5 injury count.
// Possible sources of "injury count" in the UI:
//   1. injury_reports rows (table is empty per earlier check)
//   2. activity_logs with kind='rehab' (Body Map → Rehab tab)
//   3. Pain-yes replies in twilio_messages (Activity & messages → SURVEY tab)
//   4. Free-text body-area mentions parsed via parseAllRegions
// Pull each source and count.
const playerId = 46;

const { data: injRows } = await sb
  .from('injury_reports')
  .select('id,player_id,reported_at,resolved_at,regions')
  .eq('player_id', playerId);
console.log(`(1) injury_reports for player ${playerId}: ${injRows?.length ?? 0}`);

const { data: rehabLogs } = await sb
  .from('activity_logs')
  .select('id,description,logged_at,hidden,kind')
  .eq('player_id', playerId)
  .eq('kind', 'rehab')
  .order('logged_at', { ascending: true });
const visibleRehab = (rehabLogs ?? []).filter((r) => !r.hidden);
console.log(`(2) activity_logs kind='rehab' (visible): ${visibleRehab.length}  (incl. hidden: ${rehabLogs?.length})`);
for (const r of visibleRehab) {
  console.log(`     id=${r.id} ${r.logged_at}  ${JSON.stringify((r.description ?? '').slice(0, 80))}`);
}

// Pain-yes replies (numeric 1 or text 'yes') from twilio_messages
const { data: msgs } = await sb
  .from('twilio_messages')
  .select('sid,direction,body,date_sent')
  .eq('player_id', playerId)
  .order('date_sent', { ascending: true });

let painYesCount = 0;
let bodyAreaTextCount = 0;
const prevOutbound: { body: string; ts: number }[] = [];
for (const m of msgs ?? []) {
  if (m.direction !== 'inbound') {
    if (m.body) prevOutbound.push({ body: m.body, ts: new Date(m.date_sent).getTime() });
    continue;
  }
  // Find the most recent outbound question within 30min before this reply
  const replyTs = new Date(m.date_sent).getTime();
  const recentOut = [...prevOutbound]
    .reverse()
    .find((o) => replyTs - o.ts < 30 * 60 * 1000);
  if (!recentOut) continue;
  const q = recentOut.body.toLowerCase();
  const r = (m.body ?? '').trim().toLowerCase();
  if (/did any pain/.test(q) && (r === '1' || r === 'yes' || r === 'y')) painYesCount++;
  if (/which body area/.test(q) && r && r !== '0' && r.length > 1) bodyAreaTextCount++;
}
console.log(`(3) Pain=yes replies (rough): ${painYesCount}`);
console.log(`(4) "Which body area" non-skip text replies: ${bodyAreaTextCount}`);

// Phase-3 responses table — used by player-summary.ts to compute
// "Session-reported injury flags". Filter for q2_injury answer_num=1.
const { data: responses } = await sb
  .from('responses')
  .select('question_id,answer_num,answer_text,session_id,player_id,created_at')
  .eq('player_id', playerId);
console.log(`(5) responses table rows for player ${playerId}: ${responses?.length ?? 0}`);
const q2Yes = (responses ?? []).filter((r) => r.question_id === 'q2_injury' && r.answer_num === 1);
console.log(`     q2_injury=1 rows: ${q2Yes.length}  ← LLM summary calls these "session-reported injury flags"`);
for (const r of q2Yes.slice(0, 12)) {
  console.log(`       session=${r.session_id} created=${r.created_at}`);
}

// Cached LLM summary text — if any number like "7 injury" appears in
// the cached body, that's likely the source of what the user sees.
const { data: cache } = await sb
  .from('llm_cache')
  .select('cache_key,body_json,created_at')
  .like('cache_key', `%player_summary%${playerId}%`)
  .order('created_at', { ascending: false })
  .limit(3);
console.log(`\n(6) LLM cache hits for player ${playerId}: ${cache?.length ?? 0}`);
for (const c of cache ?? []) {
  const text = JSON.stringify(c.body_json).slice(0, 600);
  const injMentions = (text.match(/\d+\s*(injur|pain|concerns|reports|incidents)/gi) ?? []);
  console.log(`   key=${c.cache_key}  created=${c.created_at}`);
  console.log(`   injury mentions in body: ${JSON.stringify(injMentions)}`);
}
