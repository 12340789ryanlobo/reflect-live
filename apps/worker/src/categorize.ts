import type { Category } from '@reflect-live/shared';

// Activity-log prefixes the worker treats as "log this as a workout-class
// message" when tagging twilio_messages.category. Kept hardcoded here as a
// broad superset — reflect's webhook is the authoritative gate (it validates
// against the team's live competition scoring map before saving). If a new
// sport-kind shows up in a competition that isn't in this list, reflect will
// still save it correctly, but reflect-live's dashboard will tag the message
// as 'chat' until this list catches up. Will be replaced when activity-logging
// moves into reflect-live wholesale.
const ACTIVITY_KIND_PREFIXES = new Set([
  'workout',
  'rehab',
  'swim',
  'lift',
  'throw',
  'run',
  'bike',
]);

function leadingKind(body: string): string | null {
  const m = /^([a-z][a-z0-9_-]{0,31}):/.exec(body);
  return m ? m[1] : null;
}

export function categorize(body: string | null | undefined): Category {
  const b = (body ?? '').trim().toLowerCase();
  const kind = leadingKind(b);
  if (kind && ACTIVITY_KIND_PREFIXES.has(kind)) {
    return kind === 'rehab' ? 'rehab' : 'workout';
  }
  // Prefix-less fallback for old usage ("Workout done", "REHAB today").
  if (b.startsWith('workout')) return 'workout';
  if (b.startsWith('rehab')) return 'rehab';
  if (/^\d{1,2}\b/.test(b)) return 'survey';
  return 'chat';
}

// Specific kind to store on activity_logs. Always lowercase. Falls back to
// the broad category when no prefix is present so the legacy
// "Workout done" / "REHAB today" inputs still write the correct row.
export function extractActivityKind(
  body: string | null | undefined,
  fallback: 'workout' | 'rehab',
): string {
  const kind = leadingKind((body ?? '').trim().toLowerCase());
  if (kind && ACTIVITY_KIND_PREFIXES.has(kind)) return kind;
  return fallback;
}
