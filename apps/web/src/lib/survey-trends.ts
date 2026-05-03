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
  /** Stable key used for React lists / dedup. Lowercased normalized text. */
  key: string;
  /** Human-readable question text (first variant we saw, normalized). */
  question: string;
  /**
   * 'binary' when the question is semantically yes/no (e.g. 'Reply: 0
   * = no, 1 = yes'), even if some athletes typed a severity number
   * instead. The card clamps these to 0/1 and renders them as count
   * markers below the line chart, matching how reflect handled it.
   * 'score' is the default 0–10 line.
   */
  kind: 'binary' | 'score';
  /** All replies in this group, ascending by date. */
  points: TrendPoint[];
}

// Detect "0 = no, 1 = yes" and similar patterns in the raw question
// text. This trumps the data distribution — the question is binary
// even when athletes occasionally reply with a severity (a few "6"s).
function questionIsBinary(rawQuestion: string): boolean {
  const t = rawQuestion.toLowerCase();
  // '0 = no, 1 = yes' / '0=no 1=yes' / '0 - no, 1 - yes'
  if (/0\s*[-=]\s*no\b.*1\s*[-=]\s*yes\b/.test(t)) return true;
  if (/1\s*[-=]\s*yes\b.*0\s*[-=]\s*no\b/.test(t)) return true;
  return false;
}

const PAIR_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    // Drop replies we can't pair to a real question rather than
    // bucketing them into a generic 'Score' label — the unmatched
    // group cluttered the legend and mixed unrelated answers into one
    // misleading line. With the outbound-direction fix we now pair
    // ~95% of replies; the remainder are not worth showing.
    if (!questionBody) continue;
    const { display, key } = normalizeQuestion(questionBody);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        question: display,
        kind: questionIsBinary(questionBody) ? 'binary' : 'score',
        points: [],
      };
      groups.set(key, g);
    }
    g.points.push({ ts: m.date_sent, score });
  }

  // Sort each group's points ascending by date.
  for (const g of groups.values()) {
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
