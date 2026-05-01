// Merges activity_logs + twilio_messages into a single chronological feed
// for the unified athlete timeline. Pure logic; no side effects.

import type { ActivityLog, TwilioMessage } from '@reflect-live/shared';
import { parseAllRegions } from './injury-aliases';

export type TimelineKind =
  | 'workout'
  | 'rehab'
  | 'survey'
  | 'inbound'
  | 'outbound';

export interface TimelineEntry {
  /** Stable id: 'log:{id}' for activity_logs, 'msg:{sid}' for twilio_messages. */
  id: string;
  kind: TimelineKind;
  /** ISO timestamp the entry should be sorted by. */
  ts: string;
  /** Human-readable body — log description or message body. */
  body: string;
  /**
   * Canonical body regions referenced in the entry's text. Drives the
   * click-to-filter from the body heatmap: clicking bicep narrows the
   * timeline to entries whose `regions` include 'bicep'. Empty array
   * for entries with no recognized region (plain chat, surveys with
   * just a number).
   */
  regions: string[];
  /** Twilio message SID this entry traces back to — paired with
   *  `mediaSids` to render inline thumbnails. Activity logs forward
   *  their `source_sid`; SMS rows use their own sid. */
  messageSid: string | null;
  /** Twilio media SIDs attached to the message (mirrored onto
   *  activity_logs.media_sids by the worker so logs have direct
   *  access without a JOIN). */
  mediaSids: string[] | null;
  /** For inbound replies: the question this is answering (most
   *  recent outbound message to the same player, within 24h, that
   *  looks like a question). Pairing covers numeric AND text
   *  replies — anything that came back to a system question. */
  pairedQuestion: string | null;
  /** True when this entry is an OUTBOUND question that got paired
   *  with a later inbound reply. The reply renders the question
   *  inline (Q: ...), so the standalone outbound row is hidden to
   *  avoid duplication. Outbound questions with no reply yet stay
   *  visible. */
  pairedWithReply: boolean;
  /** Per-source extras for the row renderer. */
  meta:
    | { source: 'log'; logId: number }
    | { source: 'msg'; sid: string; direction: string };
}

// Strip the SMS protocol prefix ("Workout: " / "Rehab: " / "Recovery: ")
// from descriptions so the row body reads as content, not protocol noise.
// Also used to fingerprint messages and logs for content-based dedup.
// Exported for any view that already shows the kind as a Pill — the
// 'Workout:' / 'Rehab:' prefix is redundant in that context.
export function stripProtocolPrefix(text: string): string {
  return text.replace(/^\s*(workout|rehab|recovery)\s*:\s*/i, '').trim();
}

function fingerprint(text: string | null | undefined): string {
  return stripProtocolPrefix(text ?? '').toLowerCase().replace(/\s+/g, ' ');
}

// Within this many milliseconds, a message and a log with matching
// content fingerprints are treated as the same event. The worker's
// activity_log insert can drift far behind the SMS arrival when a
// sync runs in batch mode (legacy import, post-outage backfill), so
// 5 minutes was missing real dups. 24 hours is a safer upper bound:
// repeating the EXACT same multi-line workout description verbatim
// within a single calendar day is practically zero false-positive
// risk, and accidentally crediting it as one event is also harmless.
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function logToEntry(l: ActivityLog): TimelineEntry {
  const body = stripProtocolPrefix(l.description ?? '');
  return {
    id: `log:${l.id}`,
    kind: l.kind === 'rehab' ? 'rehab' : 'workout',
    ts: l.logged_at,
    body,
    regions: parseAllRegions(body),
    messageSid: l.source_sid ?? null,
    mediaSids: l.media_sids ?? null,
    pairedQuestion: null,
    pairedWithReply: false,
    meta: { source: 'log', logId: l.id },
  };
}

function msgToEntry(m: TwilioMessage): TimelineEntry {
  // Category drives the kind so workouts/rehab/surveys reported via SMS
  // render with the same pill as the equivalent activity_log row.
  // Plain chat falls back to direction (inbound vs outbound).
  let kind: TimelineKind;
  if (m.category === 'survey') kind = 'survey';
  else if (m.category === 'workout') kind = 'workout';
  else if (m.category === 'rehab') kind = 'rehab';
  else kind = m.direction === 'outbound' ? 'outbound' : 'inbound';

  const body = m.body ?? '';
  return {
    id: `msg:${m.sid}`,
    kind,
    ts: m.date_sent,
    body,
    regions: parseAllRegions(body),
    messageSid: m.sid,
    mediaSids: m.media_sids ?? null,
    pairedQuestion: null,
    pairedWithReply: false,
    meta: { source: 'msg', sid: m.sid, direction: m.direction },
  };
}

const PAIR_WINDOW_MS = 24 * 60 * 60 * 1000;

// Heuristic: does this outbound message look like a question worth
// pairing with a subsequent reply? Trailing '?' is the strongest
// signal; survey scaffolding ('reply', 'enter 0', '1-10', '(1=…, 10=…)')
// catches the variants where the question ends in a directive instead
// of a question mark. Casual outbound statements ('hit the pool!')
// don't pair — they aren't answering anything.
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  if (/\breply\b/i.test(t)) return true;
  if (/\benter\s+\d/i.test(t)) return true;
  if (/1\s*[-–]\s*10\b/i.test(t)) return true;
  if (/\(\s*\d+\s*=\s*\w+\s*,\s*\d+\s*=\s*\w+\s*\)/i.test(t)) return true;
  if (/\bprovide\s+your\b/i.test(t)) return true;
  return false;
}

// Pair each inbound reply with the most recent outbound *question* to
// the same player within PAIR_WINDOW_MS. Covers numeric AND text
// replies — any answer to a system question. Mutates entries in place:
//   - inbound entries get pairedQuestion set
//   - the outbound question entry gets pairedWithReply=true so it's
//     hidden from rendering (its content shows inline with the answer)
//
// Outbound questions with no reply yet stay visible so coaches can see
// what's pending. Casual outbound statements never pair.
function attachQuestionPairings(
  entries: TimelineEntry[],
  msgs: TwilioMessage[],
): void {
  // Index outbound questions by player_id, sorted asc by date_sent.
  const outboundByPlayer = new Map<number, TwilioMessage[]>();
  for (const m of msgs) {
    if (m.direction !== 'outbound' || m.player_id == null || !m.body) continue;
    if (!looksLikeQuestion(m.body)) continue;
    const arr = outboundByPlayer.get(m.player_id) ?? [];
    arr.push(m);
    outboundByPlayer.set(m.player_id, arr);
  }
  for (const arr of outboundByPlayer.values()) {
    arr.sort((a, b) => a.date_sent.localeCompare(b.date_sent));
  }

  // Track which outbound SIDs got paired so the standalone row hides.
  const pairedOutboundSids = new Set<string>();

  for (const e of entries) {
    if (e.meta.source !== 'msg' || e.meta.direction !== 'inbound') continue;
    const sid = e.meta.sid;
    const orig = msgs.find((m) => m.sid === sid);
    if (!orig || orig.player_id == null) continue;
    const candidates = outboundByPlayer.get(orig.player_id);
    if (!candidates) continue;
    const replyTs = new Date(e.ts).getTime();
    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      const cTs = new Date(c.date_sent).getTime();
      if (cTs >= replyTs) continue;
      if (replyTs - cTs > PAIR_WINDOW_MS) break;
      e.pairedQuestion = c.body!.trim();
      pairedOutboundSids.add(c.sid);
      break;
    }
  }

  // Mark paired outbound question entries as hidden.
  for (const e of entries) {
    if (e.meta.source !== 'msg' || e.meta.direction !== 'outbound') continue;
    if (pairedOutboundSids.has(e.meta.sid)) {
      e.pairedWithReply = true;
    }
  }
}

export function buildTimeline(
  logs: ActivityLog[],
  msgs: TwilioMessage[],
): TimelineEntry[] {
  // Two-tier dedup. (1) When the worker linked an activity_log to its
  // source SMS via source_sid, drop that SMS — the log is canonical.
  // (2) Some legacy / synced rows have no source_sid; for those, fall
  // back to a content-fingerprint match within DEDUP_WINDOW_MS so the
  // user doesn't see the same workout text twice (once tagged WORKOUT,
  // once tagged INBOUND).
  const sourcedSids = new Set<string>();
  const logFingerprints = new Map<string, ActivityLog[]>();
  const entries: TimelineEntry[] = [];

  for (const l of logs) {
    if (l.hidden) continue;
    if (l.source_sid) sourcedSids.add(l.source_sid);
    const fp = fingerprint(l.description);
    if (fp) {
      const arr = logFingerprints.get(fp) ?? [];
      arr.push(l);
      logFingerprints.set(fp, arr);
    }
    entries.push(logToEntry(l));
  }

  for (const m of msgs) {
    if (sourcedSids.has(m.sid)) continue;
    // Content-fingerprint fallback for unsouced rows.
    const fp = fingerprint(m.body);
    if (fp) {
      const candidates = logFingerprints.get(fp);
      if (candidates) {
        const mTime = new Date(m.date_sent).getTime();
        const sameEvent = candidates.some((l) => {
          const lTime = new Date(l.logged_at).getTime();
          return Math.abs(mTime - lTime) <= DEDUP_WINDOW_MS;
        });
        if (sameEvent) continue;
      }
    }
    entries.push(msgToEntry(m));
  }

  entries.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  attachQuestionPairings(entries, msgs);
  return entries;
}
