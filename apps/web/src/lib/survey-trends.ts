// Group an athlete's numeric survey replies by the question they
// answered, so the UI can render one trend chart per question.
//
// Pairing strategy mirrors lib/timeline.ts: for each inbound numeric
// reply, find the most recent outbound message that "looks like a
// question" within a 24h window for the same player. The outbound
// body is the question text. We normalize that text (strip the
// '[Session - Date]' prefix and 'Hey {name}!' lead-in) so the same
// question across multiple sends groups together.

import type { TwilioMessage } from '@reflect-live/shared';

export interface TrendPoint {
  /** ISO timestamp of the reply. */
  ts: string;
  /** 0-10 score the athlete sent. */
  score: number;
}

export interface QuestionTrend {
  /** Stable key used for React lists / dedup. Lowercased normalized text
   *  OR a canonical metric-bucket key (readiness / pain / mental / …)
   *  when the question matched one. */
  key: string;
  /** Short human-readable label for UI. For canonical buckets this is
   *  the bucket label (e.g. 'Pain'); otherwise the normalized question. */
  question: string;
  /** Full original question text, kept for hover tooltips and any
   *  surface that wants to disambiguate (e.g. multiple questions
   *  collapsed into the same bucket). */
  originalQuestion: string;
  /**
   * 'binary' when the question is semantically yes/no (e.g. 'Reply: 0
   * = no, 1 = yes'), even if some athletes typed a severity number
   * instead. The card clamps these to 0/1 and renders them as count
   * markers below the line chart, matching how reflect handled it.
   * 'score' is the default 0–10 line.
   */
  kind: 'binary' | 'score';
  /** All replies in this group, ascending by date. Daily-aggregated
   *  for chart rendering (one point per calendar day). Use rawCount /
   *  rawAvg / rawYesCount for honest "how many replies, how many were
   *  yes" numbers — those reflect every reply, not the post-aggregation
   *  per-day rollups. */
  points: TrendPoint[];
  /** Total number of raw replies received (before daily aggregation). */
  rawCount: number;
  /** Mean of every raw reply's score (before daily aggregation). */
  rawAvg: number;
  /** For binary kind: count of raw replies whose score ≥0.5 (clamped
   *  to "yes"). 0 for score kind. */
  rawYesCount: number;
}

// Detect "0 = no, 1 = yes" and similar patterns in the raw question
// text. This trumps the data distribution — the question is binary
// even when athletes occasionally reply with a severity (a few "6"s).
function questionIsBinary(rawQuestion: string): boolean {
  const t = rawQuestion.toLowerCase();
  if (/0\s*[-=]\s*no\b.*1\s*[-=]\s*yes\b/.test(t)) return true;
  if (/1\s*[-=]\s*yes\b.*0\s*[-=]\s*no\b/.test(t)) return true;
  return false;
}


const PAIR_WINDOW_MS = 24 * 60 * 60 * 1000;

// Canonical wellness-metric buckets, ported from reflect's
// _infer_chart_metric_identity (reflect/app/queries.py). Reflect groups
// questions by keyword match into one of these buckets, then uses the
// short bucket label everywhere (legend, summaries, alerts) instead of
// the full question text. Doing the same here means our labels match
// what coaches/athletes already know from reflect, and questions
// phrased slightly differently across sessions still group together.
//
// The order matters — first bucket whose markers match wins. More
// specific buckets (pain, sleep) come before broader ones.
const METRIC_BUCKETS: Array<{ key: string; label: string; markers: string[] }> = [
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

function inferMetric(rawQuestion: string): { key: string; label: string } | null {
  const t = rawQuestion.toLowerCase();
  for (const b of METRIC_BUCKETS) {
    if (b.markers.some((m) => t.includes(m))) return { key: b.key, label: b.label };
  }
  return null;
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

function bareScore(body: string | null): number | null {
  if (!body) return null;
  const m = /^\s*(\d{1,2}(?:\.\d+)?)\s*$/.exec(body);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return n;
}

// Normalize a question so two sends of the same template (different
// session prefix, greeting name, or trailing reply scaffolding) map
// to the same group. Without this, every micro-variant becomes its
// own legend entry and the chart fragments into noise.
//
//   '[Morning Practice - Mar 13] Hey Ryan! How well did you sleep?'
//   'Hi Ryan. How well did you sleep? Reply 1-10.'
//   'How well did you sleep? Enter 0 to skip'
//
// → all normalize to: 'how well did you sleep?'
//
// Returns { display, key }: display preserves casing for UI, key is
// lowercased for grouping.
function normalizeQuestion(raw: string): { display: string; key: string } {
  let t = raw.trim();
  // Strip leading '[…]' bracket prefix (session/date label).
  t = t.replace(/^\[[^\]]+\]\s*/, '');
  // Strip 'Hey <name>!' / 'Hi <name>,' / 'Hi <name>.' lead-in.
  t = t.replace(/^(?:hey|hi|hello)\s+\S+[!,.]?\s*/i, '');
  // Strip reply scaffolding that varies across sends but doesn't
  // change which question is being asked. Order matters — broader
  // patterns first.
  t = t.replace(/\bReply\s*(?:[:\-–])?\s*\d[\s\S]*$/i, '');
  t = t.replace(/\b(?:Enter|Type)\s+\d[\s\S]*$/i, '');
  t = t.replace(/\(\s*required\s*\)\.?\s*$/i, '');
  t = t.replace(/\s*\(.*\)\s*$/, '');
  t = t.replace(/[\s.]+$/, '');
  t = t.trim();
  return { display: t, key: t.toLowerCase() };
}

// Twilio reports outbound messages with the literal direction string
// 'outbound-api' (sent via the API) or 'outbound-reply' (auto-reply
// flow). Anything that isn't 'inbound' is outbound from our point of
// view; checking for the bare 'outbound' literal silently drops 100%
// of outbound rows and made every athlete's trends card look empty.
function isOutbound(direction: string): boolean {
  return direction !== 'inbound';
}

export function buildSurveyTrends(msgs: TwilioMessage[]): QuestionTrend[] {
  // Index outbound questions per player.
  const outboundByPlayer = new Map<number, TwilioMessage[]>();
  for (const m of msgs) {
    if (!isOutbound(m.direction) || m.player_id == null || !m.body) continue;
    if (!looksLikeQuestion(m.body)) continue;
    const arr = outboundByPlayer.get(m.player_id) ?? [];
    arr.push(m);
    outboundByPlayer.set(m.player_id, arr);
  }
  for (const arr of outboundByPlayer.values()) {
    arr.sort((a, b) => a.date_sent.localeCompare(b.date_sent));
  }

  // For each inbound numeric reply, pair with the most recent
  // outbound question. Bucket into trend groups by normalized text.
  const groups = new Map<string, QuestionTrend>();
  for (const m of msgs) {
    if (m.direction !== 'inbound' || m.player_id == null || !m.body) continue;
    const score = bareScore(m.body);
    if (score == null) continue;
    const candidates = outboundByPlayer.get(m.player_id);
    const replyTs = new Date(m.date_sent).getTime();
    let questionBody: string | null = null;
    if (candidates) {
      for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i];
        const cTs = new Date(c.date_sent).getTime();
        if (cTs >= replyTs) continue;
        if (replyTs - cTs > PAIR_WINDOW_MS) break;
        questionBody = c.body;
        break;
      }
    }
    // Drop replies we can't pair to a real question — those would
    // bucket into a single 'unmatched' line that mixes unrelated
    // answers. Anything else is fair game: if a paired question got
    // a numeric reply, the user wants to see the trend, even when we
    // can't be 100% certain it's a wellness score.
    //
    // Text-based binary detection still wins (so 'Did pain start?
    // 0=no, 1=yes' doesn't get plotted as a chaotic line on the
    // 0–10 axis when athletes typed severity), but everything else
    // becomes a score series.
    if (!questionBody) continue;
    const isBinary = questionIsBinary(questionBody);
    // Group by canonical metric bucket if the question text matches
    // one (Readiness / Pain / Mental / Sleep / etc.). Falls back to
    // text-based normalization for questions that don't fit any
    // bucket (custom team prompts). The canonical-bucket grouping is
    // what reflect uses, so labels match what coaches/athletes
    // already know from the SMS surveys.
    const bucket = inferMetric(questionBody);
    const norm = normalizeQuestion(questionBody);
    const key = bucket ? bucket.key : norm.key;
    const display = bucket ? bucket.label : norm.display;
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        question: display,
        originalQuestion: questionBody,
        kind: isBinary ? 'binary' : 'score',
        points: [],
        rawCount: 0,
        rawAvg: 0,
        rawYesCount: 0,
      };
      groups.set(key, g);
    }
    g.points.push({ ts: m.date_sent, score });
  }

  // Compute raw stats BEFORE daily aggregation (so they reflect every
  // reply, not just unique-day rollups). Without this, "11/11 yes 100%"
  // would show for an athlete with 26 replies of which only 17 were yes.
  for (const g of groups.values()) {
    g.rawCount = g.points.length;
    g.rawAvg = g.points.length
      ? g.points.reduce((a, b) => a + b.score, 0) / g.points.length
      : 0;
    g.rawYesCount = g.points.filter((p) => p.score >= 0.5).length;
  }

  // Aggregate replies on the same calendar day:
  //   - score:  mean of the day's replies (smooths jittery double-sends)
  //   - binary: max (any 'yes' wins; clamped to 0/1 at the chart layer)
  // The chart used to plot every raw reply, which produced visually
  // alarming spikes when an athlete answered a survey twice within a
  // few minutes (common when the original send timed out and the
  // reminder went out). One point per day per metric is the standard
  // wellness-tracking aggregation.
  for (const g of groups.values()) {
    g.points.sort((a, b) => a.ts.localeCompare(b.ts));
    const byDay = new Map<string, { sum: number; n: number; max: number; lastTs: string }>();
    for (const p of g.points) {
      const day = p.ts.slice(0, 10); // YYYY-MM-DD
      const cur = byDay.get(day);
      if (cur) {
        cur.sum += p.score;
        cur.n += 1;
        cur.max = Math.max(cur.max, p.score);
        cur.lastTs = p.ts;
      } else {
        byDay.set(day, { sum: p.score, n: 1, max: p.score, lastTs: p.ts });
      }
    }
    g.points = Array.from(byDay.entries()).map(([day, v]) => ({
      ts: `${day}T12:00:00Z`,
      score: g.kind === 'binary' ? v.max : v.sum / v.n,
    }));
    g.points.sort((a, b) => a.ts.localeCompare(b.ts));
  }

  // Sort by reply count desc (most-history questions first), then
  // by recency of the latest reply as a tiebreaker. Threshold is 1
  // — even a single reply is informative as a starting datapoint;
  // hiding it leaves the user wondering why the card is empty.
  return Array.from(groups.values()).sort((a, b) => {
    if (a.points.length !== b.points.length) return b.points.length - a.points.length;
    const aTs = a.points[a.points.length - 1].ts;
    const bTs = b.points[b.points.length - 1].ts;
    return bTs.localeCompare(aTs);
  });
}
