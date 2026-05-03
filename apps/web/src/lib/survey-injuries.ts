// Extract athlete-reported injuries from paired SMS-survey replies.
//
// The data flow we're modelling:
//   1. Worker sends "Did any pain or physical issue start? Reply: 0=no, 1=yes"
//   2. Athlete replies "1" (yes)
//   3. Worker sends "Which body area(s) are bothering you and when?"
//   4. Athlete replies "Left shoulder when recovering" (free text)
//
// That paired exchange is conceptually equivalent to a coach manually
// logging an injury via the Report Injury dialog — we just don't
// currently materialise it. Reflect (the source app) DOES, which is
// why coaches see an injury list there but a roughly-empty one here.
//
// This module derives those injury rows from the raw twilio_messages
// stream so reflect-live can populate injury_reports in the
// background, matching reflect's coverage.
//
// Returns one record per session that paired a Pain=yes reply with a
// non-skip body-area reply. The caller (backfill script / worker)
// upserts to injury_reports keyed on source_sid (the body-area
// reply's SID), so re-running is idempotent.

import type { TwilioMessage } from '@reflect-live/shared';
import { buildSessions, looksLikeQuestion, parseReplyScore, type Session } from './survey-trends';
import { parseInjuryRegions } from './injury-aliases';

export interface DerivedInjury {
  /** Foreign-key target. */
  player_id: number;
  team_id: number;
  /** Inbound SID of the body-area reply. Stable, unique, used for
   *  upsert idempotency on injury_reports.source_sid. */
  source_sid: string;
  /** Canonical body regions parsed from the body-area free text. */
  regions: string[];
  /** The athlete's literal body-area reply text — preserved verbatim
   *  so a coach reading the row sees the original phrasing. */
  description: string;
  /** Timestamp of the body-area reply (closer to "when the injury
   *  was reported" than the pain question). */
  reported_at: string;
}

// Heuristics — kept narrow on purpose. We're matching the standard
// reflect/sport-pulse template phrasing, not trying to parse anything
// that looks vaguely injury-shaped.
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

// Reply text that means "skip" / "n/a" / "nothing". We don't want to
// stamp an injury row for a session where the athlete answered Pain=
// yes but couldn't or didn't specify a body area.
function isSkipReply(rbody: string): boolean {
  const t = rbody.trim();
  if (!t) return true;
  if (t === '0') return true;
  const tl = t.toLowerCase();
  if (/^(none|n\/?a|nothing|skip)$/.test(tl)) return true;
  return false;
}

function extractFromSession(
  s: Session,
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
      const score = parseReplyScore(r.body);
      // Pain=yes if the athlete answered 1, 'yes', or any severity
      // number ≥1 (typed instead of the binary 0/1 the prompt asked
      // for — we treat that as a stronger 'yes' signal, not a skip).
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
  const regions = parseInjuryRegions(bodyAreaText);
  return {
    player_id: playerId,
    team_id: teamId,
    source_sid: bodyAreaSid,
    regions,
    description: bodyAreaText,
    reported_at: bodyAreaTs,
  };
}

/**
 * Walk an athlete's twilio_messages stream and emit one DerivedInjury
 * per survey session that captured a Pain=yes + body-area pair.
 *
 * Caller responsibilities:
 *   - Upsert to injury_reports with onConflict: 'source_sid' so this
 *     can be re-run safely (e.g. backfill, worker hook).
 *   - Resolve / dedup by region: the same athlete answering 'left
 *     shoulder' on three consecutive sessions produces three rows
 *     here (one per session). Whether to collapse to one logical
 *     ongoing injury is a UI concern handled by the heatmap layer.
 */
export function extractSurveyInjuries(
  msgs: TwilioMessage[],
  playerId: number,
  teamId: number,
): DerivedInjury[] {
  const ownMsgs = msgs.filter((m) => m.player_id === playerId);
  ownMsgs.sort((a, b) => a.date_sent.localeCompare(b.date_sent));
  const sessions = buildSessions(ownMsgs);
  const out: DerivedInjury[] = [];
  for (const s of sessions) {
    const inj = extractFromSession(s, playerId, teamId);
    if (inj) out.push(inj);
  }
  return out;
}

// Re-export looksLikeQuestion just so the worker import surface stays
// in one module — keeps `survey-injuries` self-contained for the
// worker without it needing to know about survey-trends internals.
export { looksLikeQuestion };
