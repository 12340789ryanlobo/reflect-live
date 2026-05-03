// Diagnose why Score trends shows empty for an athlete + the global
// outbound picture (so we can tell whether outbound messages are being
// captured at all and where they're going).
//
// Run: bun run scripts/diagnose-trends.ts <player-name-or-id>

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

const arg = process.argv[2] ?? 'Ryan';

// === GLOBAL OUTBOUND HEALTH ===
console.log('=== GLOBAL OUTBOUND HEALTH ===');
const { count: outboundCount } = await sb
  .from('twilio_messages')
  .select('sid', { count: 'exact', head: true })
  .eq('direction', 'outbound-api');
const { count: outboundReplyCount } = await sb
  .from('twilio_messages')
  .select('sid', { count: 'exact', head: true })
  .eq('direction', 'outbound-reply');
const { count: outboundPlainCount } = await sb
  .from('twilio_messages')
  .select('sid', { count: 'exact', head: true })
  .eq('direction', 'outbound');
const { count: inboundCount } = await sb
  .from('twilio_messages')
  .select('sid', { count: 'exact', head: true })
  .eq('direction', 'inbound');

console.log(`  inbound:         ${inboundCount}`);
console.log(`  outbound-api:    ${outboundCount}`);
console.log(`  outbound-reply:  ${outboundReplyCount}`);
console.log(`  outbound:        ${outboundPlainCount}`);

const { data: outboundSample } = await sb
  .from('twilio_messages')
  .select('sid,direction,from_number,to_number,body,player_id,date_sent')
  .like('direction', 'outbound%')
  .order('date_sent', { ascending: false })
  .limit(5);
console.log('  most recent outbound rows (any direction starting with "outbound"):');
for (const m of outboundSample ?? []) {
  console.log(`    [${m.direction}] player_id=${m.player_id} ${m.date_sent} from=${m.from_number} to=${m.to_number}`);
  console.log(`       body=${JSON.stringify((m.body ?? '').slice(0, 120))}`);
}
console.log();

// Mirror the (now fixed) buildSurveyTrends pairing logic.
function isOutbound(d: string): boolean {
  return d !== 'inbound';
}
function bareScore(body: string | null): number | null {
  if (!body) return null;
  const m = /^\s*(\d{1,2}(?:\.\d+)?)\s*$/.exec(body);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return n;
}
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/reminder to finish your check-in/i.test(t)) return false;
  if (/where you left off/i.test(t)) return false;
  if (t.endsWith('?')) return true;
  if (/\breply\b/i.test(t)) return true;
  if (/\benter\s+\d/i.test(t)) return true;
  if (/1\s*[-–]\s*10\b/i.test(t)) return true;
  if (/\(\s*\d+\s*=\s*\w+\s*,\s*\d+\s*=\s*\w+\s*\)/i.test(t)) return true;
  if (/\bprovide\s+your\b/i.test(t)) return true;
  return false;
}

// === PER-PLAYER PICTURE ===
const isNumeric = /^\d+$/.test(arg);
const playerQ = isNumeric
  ? sb.from('players').select('id,name,phone_e164').eq('id', Number(arg))
  : sb.from('players').select('id,name,phone_e164').ilike('name', `%${arg}%`);

const { data: players } = await playerQ.limit(10);
if (!players || players.length === 0) {
  console.log('no player found');
  process.exit(1);
}

for (const p of players) {
  console.log(`=== player #${p.id} — ${p.name} (${p.phone_e164}) ===`);

  const { data: msgs } = await sb
    .from('twilio_messages')
    .select('sid,direction,from_number,to_number,body,category,date_sent')
    .eq('player_id', p.id)
    .order('date_sent', { ascending: false })
    .limit(500);

  if (!msgs || msgs.length === 0) {
    console.log('  no messages tagged with this player_id');
    continue;
  }

  const directions: Record<string, number> = {};
  for (const m of msgs) directions[m.direction] = (directions[m.direction] ?? 0) + 1;
  console.log('  direction breakdown:', directions);

  const inbound = msgs.filter((m) => m.direction === 'inbound');
  const outbound = msgs.filter((m) => isOutbound(m.direction));
  const numericReplies = inbound.filter((m) => bareScore(m.body) != null);
  const outboundQuestions = outbound.filter((m) => m.body && looksLikeQuestion(m.body));
  console.log(`  inbound numeric replies: ${numericReplies.length}`);
  console.log(`  outbound that looksLikeQuestion: ${outboundQuestions.length}`);

  const PAIR_WINDOW_MS = 24 * 60 * 60 * 1000;
  let paired = 0;
  let unpaired = 0;
  const sample: Array<{ q: string; reply: number; ts: string }> = [];
  for (const r of numericReplies) {
    const replyTs = new Date(r.date_sent).getTime();
    const c = outboundQuestions
      .map((q) => ({ q, ts: new Date(q.date_sent).getTime() }))
      .filter((c) => c.ts < replyTs && replyTs - c.ts <= PAIR_WINDOW_MS)
      .sort((a, b) => b.ts - a.ts)[0];
    if (c) {
      paired++;
      if (sample.length < 3)
        sample.push({ q: (c.q.body ?? '').slice(0, 80), reply: bareScore(r.body)!, ts: r.date_sent });
    } else {
      unpaired++;
    }
  }
  console.log(`  paired: ${paired}   unpaired: ${unpaired}`);
  for (const s of sample) console.log(`    ex: Q=${JSON.stringify(s.q)} → ${s.reply} @ ${s.ts}`);

  // Group paired replies by NORMALIZED question to see how grouping
  // actually clusters and what the score distribution within each
  // group looks like (binary vs continuous).
  function normalize(q: string): string {
    let s = q.trim();
    s = s.replace(/^\[[^\]]+\]\s*/, '');
    s = s.replace(/^(?:hey|hi|hello)\s+\S+[!,.]?\s*/i, '');
    s = s.replace(/\bReply\s*(?:[:\-–])?\s*\d[\s\S]*$/i, '');
    s = s.replace(/\b(?:Enter|Type)\s+\d[\s\S]*$/i, '');
    s = s.replace(/\(\s*required\s*\)\.?\s*$/i, '');
    s = s.replace(/\s*\(.*\)\s*$/, '');
    s = s.replace(/[\s.]+$/, '');
    return s.toLowerCase().trim();
  }
  function questionIsBinaryText(q: string): boolean {
    const t = q.toLowerCase();
    return /0\s*[-=]\s*no\b.*1\s*[-=]\s*yes\b/.test(t) || /1\s*[-=]\s*yes\b.*0\s*[-=]\s*no\b/.test(t);
  }
  function questionIsScoreText(q: string): boolean {
    const t = q.toLowerCase();
    if (/\b(?:reply|rate|score|enter|on a scale of?)\b[\s\S]{0,30}?(?:0|1)\s*[-–to]+\s*10\b/.test(t)) return true;
    if (/\b(?:0|1)\s*[-–to]+\s*10\b/.test(t) && /\b(?:score|rate|rating|reply)\b/.test(t)) return true;
    return false;
  }
  const groups = new Map<string, { q: string; replies: number[] }>();
  for (const r of numericReplies) {
    const replyTs = new Date(r.date_sent).getTime();
    const c = outboundQuestions
      .map((q) => ({ q, ts: new Date(q.date_sent).getTime() }))
      .filter((c) => c.ts < replyTs && replyTs - c.ts <= PAIR_WINDOW_MS)
      .sort((a, b) => b.ts - a.ts)[0];
    if (!c) continue;
    const key = normalize(c.q.body ?? '');
    if (!groups.has(key)) groups.set(key, { q: c.q.body ?? '', replies: [] });
    groups.get(key)!.replies.push(bareScore(r.body)!);
  }
  console.log(`  --- distinct paired questions (${groups.size}) ---`);
  for (const [k, g] of groups) {
    const counts: Record<string, number> = {};
    for (const r of g.replies) counts[r] = (counts[r] ?? 0) + 1;
    const distrib = Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0])).map(([s, n]) => `${s}×${n}`).join(' ');
    const isBinary = questionIsBinaryText(g.q);
    const isScore = questionIsScoreText(g.q);
    const tag = isBinary ? 'BINARY' : isScore ? 'SCORE ' : 'DROP  ';
    console.log(`    [${g.replies.length}] ${tag} ${distrib}`);
    console.log(`         "${g.q.slice(0, 110)}"`);
  }

  // Look for outbound rows where to_number == this player's phone, even
  // if player_id wasn't backfilled (i.e. detect tagging gaps).
  if (p.phone_e164) {
    const { count: outboundToPhone } = await sb
      .from('twilio_messages')
      .select('sid', { count: 'exact', head: true })
      .like('direction', 'outbound%')
      .eq('to_number', p.phone_e164);
    console.log(`  outbound rows TO this phone (regardless of player_id): ${outboundToPhone}`);
  }
}
