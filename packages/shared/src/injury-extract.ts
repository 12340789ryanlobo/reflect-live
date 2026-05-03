// Self-contained injury extractor used by both the live worker
// (apps/worker/src/poll.ts) and the on-demand backfill script
// (scripts/backfill-survey-injuries.ts).
//
// Extracts injury rows from paired SMS-survey exchanges:
//
//   Q: 'Did any pain or physical issue start? Reply: 0=no, 1=yes'
//   A: '1' (yes)
//   Q: 'Which body area(s) are bothering you and when?'
//   A: 'Left shoulder when recovering in freestyle stroke'
//
// That paired exchange is conceptually identical to a coach manually
// logging an injury via the Report Injury dialog. This extractor lets
// us materialise those into injury_reports automatically so the
// heatmap injury tab + LLM player summary see a real injury list,
// instead of an empty table when athletes have been reporting pain
// purely through SMS surveys.
//
// Module is self-contained on purpose — the apps/web/src/lib/ copies
// of session-pairing helpers and parseInjuryRegions stay where they
// are (they have UI-specific siblings), and we accept the small
// duplication so the worker can import this without dragging in
// next-only deps.

import type { TwilioMessage } from './types';

// ─── session pairing ──────────────────────────────────────────────

/** A new session starts when prior session was explicitly closed by a
 *  worker ack OR when this many ms have passed since the last
 *  message. 12 hours covers normal "athlete replied late, survey
 *  resumed" cycles without bleeding into the next day's send. */
const HARD_GAP_MS = 12 * 60 * 60 * 1000;

export interface SmsSession {
  outbound: TwilioMessage[];
  inbound: TwilioMessage[];
  ended: boolean;
}

function isOutbound(direction: string): boolean {
  return direction !== 'inbound';
}

// Identify outbound messages that are real survey questions (not
// system acks, re-prompts, signup messages, or filler).
export function looksLikeSurveyQuestion(text: string): boolean {
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

function isSessionEndingAck(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /^thanks for checking in/.test(t) ||
    /^got it[,!.]?\s*thanks/.test(t) ||
    /^all done/.test(t) ||
    /^noted[,!.]?\s*thanks/.test(t) ||
    /\bappreciate the input/.test(t)
  );
}

// Parse an inbound reply into a 0–10 score. Accepts bare numerics and
// case-insensitive yes/no.
export function parseSurveyReplyScore(body: string | null): number | null {
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

export function buildSmsSessions(playerMsgs: TwilioMessage[]): SmsSession[] {
  const sessions: SmsSession[] = [];
  let cur: SmsSession | null = null;
  let lastTs = 0;
  for (const m of playerMsgs) {
    const ts = new Date(m.date_sent).getTime();
    const longGap = ts - lastTs > HARD_GAP_MS;
    const prevEnded = cur?.ended ?? false;
    if (!cur || longGap || prevEnded) {
      cur = { outbound: [], inbound: [], ended: false };
      sessions.push(cur);
    }
    if (m.direction === 'inbound') {
      if (m.body && m.body.trim()) cur.inbound.push(m);
    } else if (isOutbound(m.direction)) {
      if (!m.body) {
        // skip
      } else if (isSessionEndingAck(m.body)) {
        cur.ended = true;
      } else if (looksLikeSurveyQuestion(m.body)) {
        cur.outbound.push(m);
      }
    }
    lastTs = ts;
  }
  return sessions;
}

// ─── body region parsing ───────────────────────────────────────────
//
// Minimal region parser for the worker. Handles common phrasings
// athletes use to answer 'Which body area is bothering you?'. The
// web app has a richer parser in apps/web/src/lib/injury-aliases.ts;
// keep the alias maps here in lockstep when adding new ones there.

const REGION_KEYS = [
  'hand', 'wrist', 'forearm', 'elbow',
  'bicep', 'tricep', 'shoulder',
  'upper_back', 'mid_back', 'lower_back', 'neck',
  'hip', 'groin', 'hamstring', 'quad', 'knee', 'calf',
  'shin', 'ankle', 'foot', 'achilles', 'chest', 'abs', 'obliques',
] as const;
export type WorkerBodyRegion = typeof REGION_KEYS[number];

// (alias → canonical) — the most common reflect/sport-pulse phrasings.
// Multi-word aliases must come before their single-word equivalents
// so 'lower back' wins over 'back' alone.
const ALIASES: Array<[string, WorkerBodyRegion[]]> = [
  // Multi-word first (longest-match wins)
  ['rotator cuff', ['shoulder']],
  ['shoulder blade', ['upper_back']],
  ['shoulder blades', ['upper_back']],
  ['lower back', ['lower_back']],
  ['low back', ['lower_back']],
  ['mid back', ['mid_back']],
  ['middle back', ['mid_back']],
  ['upper back', ['upper_back']],
  ['inner thigh', ['groin']],
  ['posterior thigh', ['hamstring']],
  ['anterior thigh', ['quad']],
  ['shin splint', ['shin']],
  ['shin splints', ['shin']],
  ['achilles tendon', ['achilles']],
  ['it band', ['hip']],
  ['tennis elbow', ['elbow']],
  // Singles
  ['hands', ['hand']], ['hand', ['hand']], ['fingers', ['hand']], ['finger', ['hand']],
  ['wrists', ['wrist']], ['wrist', ['wrist']],
  ['forearms', ['forearm']], ['forearm', ['forearm']],
  ['elbows', ['elbow']], ['elbow', ['elbow']],
  ['biceps', ['bicep']], ['bicep', ['bicep']],
  ['triceps', ['tricep']], ['tricep', ['tricep']],
  ['shoulders', ['shoulder']], ['shoulder', ['shoulder']], ['deltoid', ['shoulder']],
  ['lat', ['upper_back']], ['lats', ['upper_back']], ['traps', ['upper_back']], ['trap', ['upper_back']],
  ['neck', ['neck']],
  ['hips', ['hip']], ['hip', ['hip']], ['glute', ['hip']], ['glutes', ['hip']],
  ['groin', ['groin']], ['adductor', ['groin']],
  ['hamstring', ['hamstring']], ['hamstrings', ['hamstring']], ['hammy', ['hamstring']], ['hammies', ['hamstring']],
  ['quad', ['quad']], ['quads', ['quad']], ['quadriceps', ['quad']], ['thigh', ['quad']],
  ['knees', ['knee']], ['knee', ['knee']],
  ['calves', ['calf']], ['calf', ['calf']],
  ['shins', ['shin']], ['shin', ['shin']],
  ['ankles', ['ankle']], ['ankle', ['ankle']],
  ['feet', ['foot']], ['foot', ['foot']], ['toes', ['foot']], ['toe', ['foot']],
  ['heel', ['achilles']], ['heels', ['achilles']], ['achilles', ['achilles']],
  ['chest', ['chest']], ['pec', ['chest']], ['pecs', ['chest']],
  ['abs', ['abs']], ['core', ['abs']], ['stomach', ['abs']],
  ['obliques', ['obliques']],
  // Group expansions LAST so 'lower back' / 'upper back' have matched first
  ['back', ['upper_back', 'mid_back', 'lower_back']],
  ['arm', ['bicep', 'tricep', 'forearm']],
  ['arms', ['bicep', 'tricep', 'forearm']],
];

const ALIAS_RE = ALIASES.map(([phrase, regions]) => ({
  phrase,
  regions,
  re: new RegExp(`(?<![a-z])${phrase.replace(/\s+/g, '\\s+')}(?![a-z])`, 'i'),
}));

/**
 * Free-text → canonical body region keys. Returns ['other'] when no
 * known phrase matches. Side modifiers (left, right, bilateral, both)
 * are stripped before matching so 'left shoulder' and 'right shoulder'
 * both map to ['shoulder'].
 */
export function parseInjuryRegionsLite(rawText: string | null | undefined): string[] {
  if (!rawText) return ['other'];
  let t = rawText
    .toLowerCase()
    .replace(/\b(left|right|bilateral|both|either|lt|rt)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return ['other'];

  const found = new Set<WorkerBodyRegion>();
  for (const { phrase, regions, re } of ALIAS_RE) {
    if (re.test(t)) {
      for (const r of regions) found.add(r);
      // Consume the matched span so a shorter alias inside it doesn't
      // re-fire (e.g. 'lower back' shouldn't also match 'back' →
      // upper_back/mid_back).
      t = t.replace(new RegExp(re.source, 'gi'), ' '.repeat(phrase.length));
    }
  }
  return found.size > 0 ? [...found] : ['other'];
}

// ─── injury extraction ────────────────────────────────────────────

export interface DerivedInjury {
  player_id: number;
  team_id: number;
  /** Inbound SID of the body-area reply. Stable, unique, used for
   *  injury_reports.source_sid upsert. */
  source_sid: string;
  regions: string[];
  description: string;
  reported_at: string;
}

function isPainQuestion(qbody: string): boolean {
  const t = qbody.toLowerCase();
  return /\bpain\b/.test(t) && /\b(start|get worse|during|today)\b/.test(t);
}

function isBodyAreaQuestion(qbody: string): boolean {
  const t = qbody.toLowerCase();
  return (
    /\bwhich body area/.test(t) ||
    (/\bwhere\b/.test(t) && /\b(hurt|pain|sore|bothering)\b/.test(t))
  );
}

function isSkipReply(rbody: string): boolean {
  const t = rbody.trim();
  if (!t) return true;
  if (t === '0') return true;
  const tl = t.toLowerCase();
  if (/^(none|n\/?a|nothing|skip)$/.test(tl)) return true;
  return false;
}

function extractFromSession(
  s: SmsSession,
  playerId: number,
  teamId: number,
): DerivedInjury | null {
  const len = Math.min(s.outbound.length, s.inbound.length);
  let painYes = false;
  let bodyAreaText: string | null = null;
  let bodyAreaSid: string | null = null;
  let bodyAreaTs: string | null = null;
  for (let i = 0; i < len; i++) {
    const q = s.outbound[i].body ?? '';
    const r = s.inbound[i];
    if (!r.body) continue;
    if (isPainQuestion(q)) {
      const score = parseSurveyReplyScore(r.body);
      if (score != null && score >= 0.5) painYes = true;
    } else if (isBodyAreaQuestion(q)) {
      if (!isSkipReply(r.body)) {
        bodyAreaText = r.body.trim();
        bodyAreaSid = r.sid;
        bodyAreaTs = r.date_sent;
      }
    }
  }
  if (!painYes || !bodyAreaText || !bodyAreaSid || !bodyAreaTs) return null;
  return {
    player_id: playerId,
    team_id: teamId,
    source_sid: bodyAreaSid,
    regions: parseInjuryRegionsLite(bodyAreaText),
    description: bodyAreaText,
    reported_at: bodyAreaTs,
  };
}

/** Walk an athlete's chronological message stream and emit one
 *  DerivedInjury per session that paired Pain=yes + non-skip body
 *  area. Caller upserts to injury_reports keyed on source_sid. */
export function extractDerivedInjuries(
  msgs: TwilioMessage[],
  playerId: number,
  teamId: number,
): DerivedInjury[] {
  const ownMsgs = msgs.filter((m) => m.player_id === playerId);
  ownMsgs.sort((a, b) => a.date_sent.localeCompare(b.date_sent));
  const sessions = buildSmsSessions(ownMsgs);
  const out: DerivedInjury[] = [];
  for (const s of sessions) {
    const inj = extractFromSession(s, playerId, teamId);
    if (inj) out.push(inj);
  }
  return out;
}
