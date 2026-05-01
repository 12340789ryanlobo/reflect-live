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
    meta: { source: 'msg', sid: m.sid, direction: m.direction },
  };
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
  return entries;
}
