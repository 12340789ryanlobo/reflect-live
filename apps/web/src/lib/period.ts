// Shared time-window primitives. Every page that filters/displays data
// over a rolling window uses this Period type so the UX stays consistent.
//
//   number  → "last N days" (cutoff = now - N * 86400s)
//   'all'   → no cutoff, include every record

export type Period = number | 'all';

/** Stable string form for cache keys and URL params. */
export function periodKey(p: Period): string {
  return p === 'all' ? 'all' : String(p);
}

/** Long form for headings / placeholders ("Last 14 days", "All-time"). */
export function periodLabel(p: Period): string {
  return p === 'all' ? 'All-time' : `Last ${p} days`;
}

/** Short form for toggle buttons ("14d", "All"). */
export function periodShortLabel(p: Period): string {
  return p === 'all' ? 'All' : `${p}d`;
}

/** Sentence fragment used inside summary copy ("across all recorded check-ins" / "in the last 14 days"). */
export function periodPhrase(p: Period): string {
  return p === 'all' ? 'across all recorded data' : `in the last ${p} days`;
}

/** ISO-string cutoff for `.gte('created_at', …)` queries. Null when all-time. */
export function periodSinceIso(p: Period, now: Date = new Date()): string | null {
  if (p === 'all') return null;
  return new Date(now.getTime() - p * 86400 * 1000).toISOString();
}

/** Parse a query-string value into a Period. Falls back to `fallback` (default 14) on garbage. */
export function parsePeriod(raw: string | null | undefined, fallback: Period = 14): Period {
  if (raw === 'all') return 'all';
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0 && n <= 365) return n;
  return fallback;
}
