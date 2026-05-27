/**
 * Humanization helpers — used across the dashboard so raw DB values
 * never leak into the UI.
 */

import type { Category, Player } from '@reflect-live/shared';

/** "workout" → "Workout", "survey" → "Check-in", "chat" → "Chat". */
export function prettyCategory(c: Category | string): string {
  switch (c) {
    case 'workout': return 'Workout';
    case 'rehab': return 'Rehab';
    case 'survey': return 'Check-in';
    case 'chat': return 'Chat';
    default: return String(c).charAt(0).toUpperCase() + String(c).slice(1);
  }
}

/** "inbound" → "Received", "outbound-api" → "Sent", etc. */
export function prettyDirection(d: string | null | undefined): string {
  if (!d) return '—';
  if (d === 'inbound') return 'Received';
  if (d.startsWith('outbound')) return 'Sent';
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** Strip "whatsapp:" / "sms:" prefixes. */
function stripScheme(phone: string): string {
  return phone.replace(/^(whatsapp|sms):/i, '').trim();
}

/** Format a phone number readably. Falls back to E.164 for non-US numbers. */
export function prettyPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const p = stripScheme(phone);
  const digits = p.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    // US: +1 (NNN) NNN-NNNN
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return p; // already +country form
}

/** "3m ago", "2h ago", "Yesterday", "Apr 12". */
export function relativeTime(iso: string | Date | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = (nowMs - d.getTime()) / 1000;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const daysAgo = Math.floor(diff / 86400);
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return `${daysAgo}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Apr 22, 2026 · 10:34 PM" */
export function prettyDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Apr 22" or "Apr 22, 2026" if not current year. */
export function prettyDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

/** Format a pure calendar date (YYYY-MM-DD) WITHOUT timezone shifting.
 *  `new Date("2027-12-02")` parses as UTC midnight and then renders in
 *  local time, which bumps US zones back to Dec 1. We split the parts
 *  and build a local-midnight Date so the displayed day always matches
 *  the stored calendar date (and the <input type="date"> value). Use
 *  this for date-only columns like locations.event_date — NOT for
 *  timestamps (prettyDate/prettyDateTime are correct for those). */
export function prettyCalendarDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

/** Whole-day difference between today and a YYYY-MM-DD calendar date,
 *  both taken at LOCAL midnight so there's no UTC off-by-one. Positive
 *  = future, 0 = today, negative = past. */
export function daysUntilCalendarDate(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return 0;
  const event = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((event.getTime() - todayMid.getTime()) / 86_400_000);
}

/** Human-friendly relative countdown for a calendar day-count. Reads
 *  the way a person thinks about time — "in 3 days", "in 2 weeks",
 *  "in 9 months" — instead of a raw day number (260d). Negative =
 *  past. Pair with daysUntilCalendarDate. */
export function humanizeDaysUntil(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const a = Math.abs(days);
  const unit = a < 14 ? `${a} days` : a < 60 ? `${Math.round(a / 7)} weeks` : `${Math.round(a / 30)} months`;
  return days > 0 ? `in ${unit}` : `${unit} ago`;
}

/** Given a Player[], build an O(1) lookup by phone_e164. */
export function buildPhoneIndex(players: Player[]): Map<string, Player> {
  const m = new Map<string, Player>();
  for (const p of players) m.set(p.phone_e164, p);
  return m;
}

/** Given a Player[], build an O(1) lookup by id. */
export function buildPlayerIndex(players: Player[]): Map<number, Player> {
  const m = new Map<number, Player>();
  for (const p of players) m.set(p.id, p);
  return m;
}

/** Short first-name + last-initial, e.g. "Alex S." */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
