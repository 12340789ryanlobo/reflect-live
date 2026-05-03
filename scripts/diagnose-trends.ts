// Verify session-based in-order pairing produces correct metric
// buckets for an athlete. Mirrors the lib's buildSurveyTrends logic.
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

// Mirror the lib filters/helpers exactly so this script tracks reality.
function parseReplyScore(body: string | null): number | null {
  if (!body) return null;
  const t = body.trim();
  const m = /^\s*(\d{1,2}(?:\.\d+)?)\s*$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
    return null;
  }
  const tl = t.toLowerCase();
  if (tl === 'yes' || tl === 'y') return 1;
  if (tl === 'no' || tl === 'n') return 0;
  return null;
}
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(noted|got it|all done|appreciate|thanks for|thank you for)\b/i.test(t)) return false;
  if (/your coach has set up/i.test(t)) return false;
  if (/^please reply\b/i.test(t)) return false;
  if (/^(invalid|sorry|i didn'?t understand|that didn'?t look)/i.test(t)) return false;
  if (/reminder to finish your check-in/i.test(t)) return false;
  if (/where you left off/i.test(t)) return false;
  if (/\?/.test(t)) return true;
  if (/\breply\b/i.test(t)) return true;
  if (/\benter\s+\d/i.test(t)) return true;
  if (/\(\s*\d+\s*=/.test(t)) return true;
  if (/\bprovide\s+your\b/i.test(t)) return true;
  if (/\bon a scale of\b/i.test(t)) return true;
  return false;
}
const METRIC_BUCKETS = [
  { key: 'readiness', label: 'Readiness', markers: ['readiness'] },
  { key: 'sleep', label: 'Sleep', markers: ['sleep'] },
  { key: 'focus', label: 'Focus', markers: ['focus', 'locked in', 'concentrat'] },
  { key: 'rpe', label: 'RPE', markers: ['rpe', 'exertion', 'how hard', 'hard did'] },
  { key: 'mental', label: 'Mental', markers: ['mental', 'stress', 'mood', 'overwhelmed', 'manageable'] },
  { key: 'pain', label: 'Pain', markers: ['pain', 'soreness'] },
  { key: 'recovery', label: 'Recovery', markers: ['recovery', 'recovered', 'fatigue', 'fatigued'] },
  { key: 'energy', label: 'Energy', markers: ['energy'] },
  { key: 'effort', label: 'Effort', markers: ['effort'] },
];
function inferMetric(q: string): string {
  const t = q.toLowerCase();
  for (const b of METRIC_BUCKETS) {
    if (b.markers.some((m) => t.includes(m))) return b.label;
  }
  return '(custom)';
}
function isBinaryQ(q: string): boolean {
  const t = q.toLowerCase();
  return /0\s*[-=]\s*no\b.*1\s*[-=]\s*yes\b/.test(t) || /1\s*[-=]\s*yes\b.*0\s*[-=]\s*no\b/.test(t);
}

const isNumeric = /^\d+$/.test(arg);
const playerQ = isNumeric
  ? sb.from('players').select('id,name').eq('id', Number(arg))
  : sb.from('players').select('id,name').ilike('name', `%${arg}%`);
const { data: players } = await playerQ.limit(5);
if (!players || players.length === 0) {
  console.log('no player found');
  process.exit(1);
}

for (const p of players) {
  console.log(`\n=== player #${p.id} ${p.name} ===`);
  const { data: msgs } = await sb
    .from('twilio_messages')
    .select('sid,direction,body,date_sent')
    .eq('player_id', p.id)
    .order('date_sent', { ascending: true })
    .limit(2000);
  if (!msgs || msgs.length === 0) {
    console.log('  no messages');
    continue;
  }

  const SESSION_GAP_MS = 30 * 60 * 1000;
  type Sess = { outbound: typeof msgs; inbound: typeof msgs };
  const sessions: Sess[] = [];
  let cur: Sess | null = null;
  let lastTs = 0;
  for (const m of msgs) {
    const ts = new Date(m.date_sent).getTime();
    if (!cur || ts - lastTs > SESSION_GAP_MS) {
      cur = { outbound: [], inbound: [] };
      sessions.push(cur);
    }
    if (m.direction === 'inbound') {
      if (m.body && m.body.trim()) cur.inbound.push(m);
    } else {
      if (m.body && looksLikeQuestion(m.body)) cur.outbound.push(m);
    }
    lastTs = ts;
  }
  console.log(`  ${sessions.length} sessions`);

  const groups = new Map<string, { label: string; isBinary: boolean; replies: number[]; example: string }>();
  let totalNumeric = 0;
  let totalText = 0;
  let unmatched = 0;
  for (const s of sessions) {
    const len = Math.min(s.outbound.length, s.inbound.length);
    for (let i = 0; i < len; i++) {
      const q = s.outbound[i].body!;
      const r = s.inbound[i].body!;
      const sc = parseReplyScore(r);
      if (sc == null) {
        totalText++;
        continue;
      }
      totalNumeric++;
      const label = inferMetric(q);
      if (label === '(custom)') unmatched++;
      const key = label.toLowerCase();
      let g = groups.get(key);
      if (!g) {
        g = { label, isBinary: isBinaryQ(q), replies: [], example: q.replace(/\s+/g, ' ').slice(0, 80) };
        groups.set(key, g);
      }
      g.replies.push(sc);
    }
  }

  // Verbose per-session dump of the first 4 sessions so we can see
  // what's happening in the pairing.
  console.log(`  --- first 4 sessions detail ---`);
  for (let si = 0; si < Math.min(4, sessions.length); si++) {
    const s = sessions[si];
    console.log(`  [session ${si}] outbound=${s.outbound.length} inbound=${s.inbound.length}`);
    const len = Math.min(s.outbound.length, s.inbound.length);
    for (let i = 0; i < len; i++) {
      const q = s.outbound[i].body!.replace(/\s+/g, ' ').slice(0, 60);
      const r = s.inbound[i].body!.replace(/\s+/g, ' ').slice(0, 30);
      const bucket = inferMetric(q);
      console.log(`    Q${i + 1}[${bucket}]: ${q}`);
      console.log(`    R${i + 1}: ${r}`);
    }
    if (s.outbound.length > len) {
      for (let i = len; i < s.outbound.length; i++) {
        console.log(`    Q${i + 1}[unanswered]: ${s.outbound[i].body!.replace(/\s+/g, ' ').slice(0, 60)}`);
      }
    }
    if (s.inbound.length > len) {
      for (let i = len; i < s.inbound.length; i++) {
        console.log(`    R${i + 1}[unpaired]: ${s.inbound[i].body!.replace(/\s+/g, ' ').slice(0, 30)}`);
      }
    }
  }
  console.log();
  console.log(`  paired numeric: ${totalNumeric}   paired text (ignored for chart): ${totalText}   custom: ${unmatched}`);
  for (const [, g] of groups) {
    const yes = g.replies.filter((s) => s >= 0.5).length;
    const sum = g.replies.reduce((a, b) => a + b, 0);
    const avg = sum / g.replies.length;
    const tag = g.isBinary ? 'BINARY' : 'SCORE ';
    console.log(`    ${tag} ${g.label.padEnd(10)} n=${String(g.replies.length).padEnd(3)} avg=${avg.toFixed(2)} yes=${yes}`);
    console.log(`           ex: "${g.example}"`);
  }
}
