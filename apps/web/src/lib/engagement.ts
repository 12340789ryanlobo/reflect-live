// Per-athlete training momentum: each athlete's activity-log count over a
// selected window vs. their own trailing baseline. Pure (no I/O) so it's
// unit-testable; the fetch lives in use-engagement.ts.

const DAY_MS = 24 * 3600 * 1000;
const BASELINE_WINDOWS = 4; // compare against the 4 windows before the selected one
const REGULAR_FLOOR = 2; // baselineRate ≥ this to be "a regular"
const COOLING_RATIO = 0.5; // windowCount ≤ baseline × this → cooling
const HEATING_RATIO = 1.5; // windowCount ≥ this × max(baseline,1) → heating
const MIN_ACTIVE = 2; // heating requires at least this many logs (kills 0→1 noise)

export type EngagementBucket = 'heating' | 'steady' | 'cooling' | 'quiet' | 'new';

export interface EngagementPlayer {
  id: number;
  name: string;
  group: string | null;
}

export interface EngagementLog {
  player_id: number | null;
  logged_at: string;
}

export interface EngagementInput {
  players: EngagementPlayer[];
  logs: EngagementLog[];
  windowDays: number | null; // null = "all" (no baseline comparison)
  now: number; // ms epoch, injected for testability
}

export interface EngagementRow {
  player_id: number;
  name: string;
  group: string | null;
  windowCount: number; // logs in the selected window
  baselineRate: number; // expected per-window count from the prior 4 windows
  delta: number; // windowCount − baselineRate (signed; ranks Movers)
  lastActive: string | null;
  bucket: EngagementBucket;
  severity: number; // |delta|-based; for sorting within a side
}

export function computeEngagement(inp: EngagementInput): EngagementRow[] {
  const { players, logs, windowDays, now } = inp;

  const timesByPlayer = new Map<number, number[]>();
  for (const l of logs) {
    if (l.player_id == null) continue;
    const t = Date.parse(l.logged_at);
    if (Number.isNaN(t)) continue;
    const arr = timesByPlayer.get(l.player_id) ?? [];
    arr.push(t);
    timesByPlayer.set(l.player_id, arr);
  }

  const rows: EngagementRow[] = [];
  for (const p of players) {
    const times = timesByPlayer.get(p.id) ?? [];
    const lastActive = times.length ? new Date(Math.max(...times)).toISOString() : null;

    if (windowDays == null) {
      rows.push({
        player_id: p.id, name: p.name, group: p.group,
        windowCount: times.length, baselineRate: 0, delta: times.length,
        lastActive, bucket: 'new', severity: times.length,
      });
      continue;
    }

    const W = windowDays * DAY_MS;
    const windowStart = now - W;
    const baselineStart = now - (BASELINE_WINDOWS + 1) * W;

    let windowCount = 0;
    let baselineCount = 0;
    for (const t of times) {
      if (t >= windowStart && t <= now) windowCount++;
      else if (t >= baselineStart && t < windowStart) baselineCount++;
    }
    const baselineRate = baselineCount / BASELINE_WINDOWS;
    const delta = windowCount - baselineRate;

    let bucket: EngagementBucket;
    if (windowCount >= MIN_ACTIVE && windowCount >= HEATING_RATIO * Math.max(baselineRate, 1)) {
      bucket = 'heating';
    } else if (baselineRate < REGULAR_FLOOR) {
      bucket = 'new';
    } else if (windowCount === 0) {
      bucket = 'quiet';
    } else if (windowCount <= COOLING_RATIO * baselineRate) {
      bucket = 'cooling';
    } else {
      bucket = 'steady';
    }

    rows.push({
      player_id: p.id, name: p.name, group: p.group,
      windowCount, baselineRate, delta, lastActive, bucket,
      severity: Math.abs(delta) * 10,
    });
  }
  return rows;
}
