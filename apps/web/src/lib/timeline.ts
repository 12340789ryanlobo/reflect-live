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
  /** For inbound survey replies: the question that was sent
   *  immediately before this reply (most recent outbound to the
   *  same player within a 24h window). Lets the timeline render
   *  the row as 'Q: How ready? / A: 10' rather than just '10'. */
  pairedQuestion: string | null;
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
    meta: { source: 'msg', sid: m.sid, direction: m.direction },
  };
}

const PAIR_WINDOW_MS = 24 * 60 * 60 * 1000;

// Pair each inbound survey reply with the most recent outbound message
// to the same player within PAIR_WINDOW_MS. Survey questions arrive as
// outbound system SMS and replies arrive as inbound — the most-recent-
// outbound-before-inbound is reliably the question being answered, even
// without a formal sessions/responses linkage. Mutates entries in place.
function attachSurveyQuestions(
  entries: TimelineEntry[],
  msgs: TwilioMessage[],
): void {
  // Index outbound messages by player_id, sorted asc by date_sent.
  const outboundByPlayer = new Map<number, TwilioMessage[]>();
  for (const m of msgs) {
    if (m.direction !== 'outbound' || m.player_id == null || !m.body) continue;
    const arr = outboundByPlayer.get(m.player_id) ?? [];
    arr.push(m);
    outboundByPlayer.set(m.player_id, arr);
  }
  for (const arr of outboundByPlayer.values()) {
    arr.sort((a, b) => a.date_sent.localeCompare(b.date_sent));
  }
  // For each inbound survey reply, walk back through that player's
  // outbounds to find the most recent question within the window.
  for (const e of entries) {
    if (e.kind !== 'survey') continue;
    if (e.meta.source !== 'msg' || e.meta.direction !== 'inbound') continue;
    const sid = e.meta.sid;
    const orig = msgs.find((m) => m.sid === sid);
    if (!orig || orig.player_id == null) continue;
    const candidates = outboundByPlayer.get(orig.player_id);
    if (!candidates) continue;
    const replyTs = new Date(e.ts).getTime();
    let best: TwilioMessage | null = null;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      const cTs = new Date(c.date_sent).getTime();
      if (cTs >= replyTs) continue; // must be before
      if (replyTs - cTs > PAIR_WINDOW_MS) break; // too old, stop walking
      best = c;
      break;
    }
    if (best?.body) e.pairedQuestion = best.body.trim();
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
  attachSurveyQuestions(entries, msgs);
  return entries;
}
