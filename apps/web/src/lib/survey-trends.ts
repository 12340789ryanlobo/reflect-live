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

// Classify the EXPECTED answer type from the question text alone, so
// we know whether to chart a reply at all and how. Pattern-driven
// (not bucket-driven) so a coach who writes a new template doesn't
// have to register it in a list — if the question phrasing follows
// any of the conventions below, it's classified automatically:
//
//   'score'   — explicit numeric scale ('1-10', '1 = X, 10 = Y',
//               'on a scale of', 'rate', 'score')
//   'binary'  — yes/no scaffolding OR English yes/no question form
//               ('did/has/is/are' + '?')
//   'text'    — open-ended ('what', 'which', 'describe', 'one thing',
//               'if yes, ...'). These NEVER chart, even when athletes
//               reply with a stray '0' (skip attempt) or 'yes' (typo).
//   'unknown' — we couldn't tell. Caller falls back to data-driven
//               detection so a novel-but-numeric template still
//               renders.
//
// Order of patterns matters — explicit score/binary scaffolding
// trumps the looser 'starts with what/which' text test.
type AnswerType = 'score' | 'binary' | 'text' | 'unknown';

function inferAnswerType(qtext: string): AnswerType {
  const t = qtext.toLowerCase();
  // Explicit score scaffolding
  if (/0\s*[-=]\s*no\b.*1\s*[-=]\s*yes\b/.test(t)) return 'binary';
  if (/1\s*[-=]\s*yes\b.*0\s*[-=]\s*no\b/.test(t)) return 'binary';
  if (/\byes\s*\/\s*no\b/.test(t)) return 'binary';
  if (/\(\s*1\s*=[^)]+,\s*10\s*=[^)]+\)/.test(t)) return 'score';
  if (/\(\s*0\s*=[^)]+,\s*10\s*=[^)]+\)/.test(t)) return 'score';
  if (/\b(?:reply|rate|score|enter)\b[^.?!]*?\b(?:0|1)\s*[-–to]+\s*10\b/.test(t))
    return 'score';
  if (/\bon\s+a\s+scale\s+of\b/.test(t)) return 'score';
  if (/\bprovide\s+your\b.*\bscore\b/.test(t)) return 'score';
  // Open-ended text questions — don't chart these even if a stray
  // numeric/yes-no reply slips through (skip attempts, typos).
  if (/^(what|which|where|how(?:'s| is| was)|describe|tell|explain|share|list|name)\b/.test(t))
    return 'text';
  if (/^if\s+yes\b/.test(t)) return 'text';
  if (/^one\s+thing\b/.test(t)) return 'text';
  if (/\benter\s+0\s+to\s+skip\b/.test(t)) return 'text';
  // English yes/no question form — caught after 'how' (since 'how'
  // questions are open-ended) and after explicit text patterns.
  if (/^(did|has|have|is|are|was|were|does|do)\b.*\?/.test(t)) return 'binary';
  return 'unknown';
}

// Score questions whose scale starts at 1 ('1 = very poorly, 10 =
// very well') treat a reply of '0' as invalid (athlete tried to skip
// — the prompt didn't offer 0). Score questions with a 0-based scale
// accept 0 normally.
function scoreScaleStart(qtext: string): 0 | 1 {
  const t = qtext.toLowerCase();
  if (/\b1\s*[-=]\s*\w+/.test(t)) return 1;
  if (/\b0\s*[-=]\s*\w+/.test(t)) return 0;
  return 1; // safe default — most wellness scales are 1-based
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

// Identify outbound messages that are real survey questions (not
// system acks, re-prompts, signup messages, or filler).
//
// Why this needs to be tight: the pairing logic walks a session's
// outbound questions in order against inbound replies in order. If a
// real question slips through (or a system ack slips in), the index
// alignment breaks and every following reply gets stapled to the
// wrong prompt. Specific bug it was hiding: 'How hard did practice
// feel? (1 = very easy, 10 = maximal effort)' has '?' in the middle
// and ends with ')', so the prior `endsWith('?')` test missed it,
// stripping that question from the session and shifting every
// subsequent answer onto the wrong prompt.
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // System acks — confirmations, not questions
  if (/^(noted|got it|all done|appreciate|thanks for|thank you for)\b/i.test(t))
    return false;
  if (/your coach has set up/i.test(t)) return false;
  // Re-prompts / validation nudges (don't open a new pairing slot —
  // they re-ask the previous question, which is already in the queue)
  if (/^please reply\b/i.test(t)) return false;
  if (/^(invalid|sorry|i didn'?t understand|that didn'?t look)/i.test(t)) return false;
  if (/reminder to finish your check-in/i.test(t)) return false;
  if (/where you left off/i.test(t)) return false;
  // Real questions — '?' anywhere, OR explicit reply/scale scaffolding
  if (/\?/.test(t)) return true;
  if (/\breply\b/i.test(t)) return true;
  if (/\benter\s+\d/i.test(t)) return true;
  if (/\(\s*\d+\s*=/.test(t)) return true; // '(1 = very easy, 10 = …)' — covers any descriptor
  if (/\bprovide\s+your\b/i.test(t)) return true;
  if (/\bon a scale of\b/i.test(t)) return true;
  return false;
}

// Parse an inbound reply into a 0–10 score. Accepts:
//   - bare numeric ('7', '6.5')
//   - case-insensitive yes/no/y/n (clamps to 1/0) — athletes often
//     reply 'No' to a binary 0=no/1=yes question instead of '0', and
//     dropping those silently hides real signal
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

// A survey "session" is a cluster of messages with the same player
// where consecutive messages are within SESSION_GAP_MS of each other.
// Outside this window, a new session begins. Empirically, athletes
// finish a check-in within a few minutes; gaps over 30 minutes mean
// a separate occasion.
const SESSION_GAP_MS = 30 * 60 * 1000;

interface Session {
  outbound: TwilioMessage[]; // questions, in chronological order
  inbound: TwilioMessage[];  // replies (numeric or text), in chronological order
}

// Walk a player's chronologically-sorted messages and group them into
// sessions by 30-minute gaps. Within each session, outbound questions
// (filtered through looksLikeQuestion to skip system acks/re-prompts)
// and inbound replies are kept in their original time order so
// downstream pairing can match Q[i] to R[i].
function buildSessions(playerMsgs: TwilioMessage[]): Session[] {
  const sessions: Session[] = [];
  let cur: Session | null = null;
  let lastTs = 0;
  for (const m of playerMsgs) {
    const ts = new Date(m.date_sent).getTime();
    if (!cur || ts - lastTs > SESSION_GAP_MS) {
      cur = { outbound: [], inbound: [] };
      sessions.push(cur);
    }
    if (m.direction === 'inbound') {
      if (m.body && m.body.trim()) cur.inbound.push(m);
    } else if (isOutbound(m.direction)) {
      if (m.body && looksLikeQuestion(m.body)) cur.outbound.push(m);
    }
    lastTs = ts;
  }
  return sessions;
}

export function buildSurveyTrends(msgs: TwilioMessage[]): QuestionTrend[] {
  // Bucket all messages by player so each athlete's flow is sessioned
  // in isolation. Sort each player's stream chronologically.
  const byPlayer = new Map<number, TwilioMessage[]>();
  for (const m of msgs) {
    if (m.player_id == null || !m.body) continue;
    const arr = byPlayer.get(m.player_id) ?? [];
    arr.push(m);
    byPlayer.set(m.player_id, arr);
  }
  for (const arr of byPlayer.values()) {
    arr.sort((a, b) => a.date_sent.localeCompare(b.date_sent));
  }

  const groups = new Map<string, QuestionTrend>();
  for (const playerMsgs of byPlayer.values()) {
    const sessions = buildSessions(playerMsgs);
    for (const s of sessions) {
      // In-order pairing: question[i] <-> reply[i]. This is correct
      // because athletes answer surveys top-to-bottom in the same
      // order the questions were sent. Most-recent-question pairing
      // (the previous algorithm) was systematically wrong: it
      // matched every reply to the LAST outbound question seen, even
      // when 3 questions were sent in a row before any reply, so
      // sleep / RPE scores ended up tagged as 'Mental' or 'Body
      // area' answers.
      const len = Math.min(s.outbound.length, s.inbound.length);
      for (let i = 0; i < len; i++) {
        const q = s.outbound[i];
        const r = s.inbound[i];
        const questionBody = q.body!;
        const answerType = inferAnswerType(questionBody);
        // Drop free-text questions from the chart entirely. Athletes
        // sometimes reply with stray numbers ('0' to skip) or yes/no
        // to text prompts, and charting those creates fake metrics
        // ("One thing you want to work on" was showing 0/2 yes
        // because two athletes typed 0 to skip).
        if (answerType === 'text') continue;
        const score = parseReplyScore(r.body);
        if (score == null) continue; // text reply — nothing to chart
        // For 1-based scale score questions, a reply of 0 is invalid
        // (athlete tried to skip but the prompt didn't offer 0). Drop.
        if (answerType === 'score' && score === 0 && scoreScaleStart(questionBody) === 1) {
          continue;
        }
        const bucket = inferMetric(questionBody);
        const norm = normalizeQuestion(questionBody);
        const key = bucket ? bucket.key : norm.key;
        const display = bucket ? bucket.label : norm.display;
        if (!key) continue;
        // Initial kind: explicit answer-type wins; 'unknown' falls
        // back to score and gets re-classified data-drivenly later.
        const initialKind: 'binary' | 'score' = answerType === 'binary' ? 'binary' : 'score';
        let g = groups.get(key);
        if (!g) {
          g = {
            key,
            question: display,
            originalQuestion: questionBody,
            kind: initialKind,
            points: [],
            rawCount: 0,
            rawAvg: 0,
            rawYesCount: 0,
          };
          groups.set(key, g);
        }
        g.points.push({ ts: r.date_sent, score });
      }
    }
  }

  // Compute raw stats BEFORE daily aggregation (so they reflect every
  // reply, not just unique-day rollups). Without this, "11/11 yes 100%"
  // would show for an athlete with 26 replies of which only 17 were yes.
  //
  // Also re-evaluate kind data-drivenly: some sessions ask the same
  // yes/no question without the explicit "Reply: 0=no, 1=yes"
  // scaffolding (e.g. just 'Did stress affect your training?'), which
  // text-based questionIsBinary() can't catch. If ≥80% of paired
  // replies are exactly 0 or 1 and nothing exceeds 1, treat as binary.
  for (const g of groups.values()) {
    g.rawCount = g.points.length;
    g.rawAvg = g.points.length
      ? g.points.reduce((a, b) => a + b.score, 0) / g.points.length
      : 0;
    g.rawYesCount = g.points.filter((p) => p.score >= 0.5).length;

    if (g.kind === 'score' && g.points.length > 0) {
      const exactly01 = g.points.filter((p) => p.score === 0 || p.score === 1).length;
      const anyAbove1 = g.points.some((p) => p.score > 1);
      if (!anyAbove1 && exactly01 / g.points.length >= 0.8) {
        g.kind = 'binary';
      }
    }
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
