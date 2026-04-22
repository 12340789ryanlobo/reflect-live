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
