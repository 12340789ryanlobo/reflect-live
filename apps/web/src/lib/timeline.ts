// Merges activity_logs + twilio_messages into a single chronological feed
// for the unified athlete timeline. Pure logic; no side effects.

import type { ActivityLog, TwilioMessage } from '@reflect-live/shared';

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
  /** Per-source extras for the row renderer. */
  meta:
    | { source: 'log'; logId: number }
    | { source: 'msg'; sid: string; direction: string };
}

// Strip the SMS protocol prefix ("Workout: " / "Rehab: ") from descriptions
// so the row body reads as content, not protocol noise.
function stripProtocolPrefix(text: string): string {
  return text.replace(/^\s*(workout|rehab)\s*:\s*/i, '').trim();
}

function logToEntry(l: ActivityLog): TimelineEntry {
  return {
    id: `log:${l.id}`,
    kind: l.kind === 'rehab' ? 'rehab' : 'workout',
    ts: l.logged_at,
    body: stripProtocolPrefix(l.description ?? ''),
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

  return {
    id: `msg:${m.sid}`,
    kind,
    ts: m.date_sent,
    body: m.body ?? '',
    meta: { source: 'msg', sid: m.sid, direction: m.direction },
  };
}

export function buildTimeline(
  logs: ActivityLog[],
  msgs: TwilioMessage[],
): TimelineEntry[] {
  // Dedup: when an activity_log was derived from an inbound SMS (linked
  // via source_sid), the SMS itself is redundant — show the canonical
  // log row only. Without this, an athlete texting "Workout: leg day..."
  // produces two rows (the inbound message AND the parsed log entry).
  const sourcedSids = new Set<string>();
  const entries: TimelineEntry[] = [];
  for (const l of logs) {
    if (l.hidden) continue;
    if (l.source_sid) sourcedSids.add(l.source_sid);
    entries.push(logToEntry(l));
  }
  for (const m of msgs) {
    if (sourcedSids.has(m.sid)) continue;
    entries.push(msgToEntry(m));
  }
  entries.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return entries;
}
