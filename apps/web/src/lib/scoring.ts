// apps/web/src/lib/scoring.ts
//
// Phase 1 — fitness scoring helpers.
// Pure aggregation lives in `aggregateLeaderboard`; the supabase-aware fetch
// is `computeLeaderboard`. Tests target the pure function directly.
//
// Migration 0029 added per-team configurable Competitions with arbitrary
// kind→points scoring + signed per-day stacking bonuses. The
// competition-aware aggregator is `aggregateCompetition` below; the legacy
// `aggregateLeaderboard` stays as the fallback when a team has no
// competitions row, so existing teams keep working without backfill.
//
// Source-of-truth: `activity_logs` is the canonical fitness record. The
// worker dual-writes SMS-tagged workouts/rehabs into it on every poll, and
// scripts/backfill-activity-logs.ts seeded historical SMS activity. Hidden
// rows (coach-deleted mistake uploads) are filtered out.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Competition, CompetitionBonusRule } from '@reflect-live/shared';
import type { Period } from './period';

export interface TeamScoring {
  workout_score: number;
  rehab_score: number;
}

export interface LeaderboardRow {
  player_id: number;
  name: string;
  group: string | null;
  workouts: number;
  rehabs: number;
  points: number;
}

export interface LeaderboardInputPlayer {
  id: number;
  name: string;
  group: string | null;
}

/**
 * One activity entry contributing to scoring. Currently sourced from
 * `activity_logs.kind`; the type leaves room for additional kinds without
 * affecting the aggregator (anything that isn't 'workout' or 'rehab' is
 * silently ignored).
 */
export interface LeaderboardInputEntry {
  player_id: number;
  kind: 'workout' | 'rehab' | string;
}

/**
 * Pure aggregation. Given the active roster and a list of activity entries
 * (already filtered to `kind` workout/rehab), compute the leaderboard.
 *
 * Sort: points DESC → workouts DESC → rehabs DESC → name ASC.
 * Players with zero contributing entries are excluded.
 */
export function aggregateLeaderboard(
  players: LeaderboardInputPlayer[],
  entries: LeaderboardInputEntry[],
  scoring: TeamScoring,
): LeaderboardRow[] {
  const counts = new Map<number, { workouts: number; rehabs: number }>();
  for (const e of entries) {
    if (e.kind !== 'workout' && e.kind !== 'rehab') continue;
    const existing = counts.get(e.player_id) ?? { workouts: 0, rehabs: 0 };
    if (e.kind === 'workout') existing.workouts += 1;
    else existing.rehabs += 1;
    counts.set(e.player_id, existing);
  }

  const playerById = new Map(players.map((p) => [p.id, p]));
  const rows: LeaderboardRow[] = [];
  for (const [player_id, c] of counts) {
    const p = playerById.get(player_id);
    if (!p) continue; // unknown player — drop
    const points = c.workouts * scoring.workout_score + c.rehabs * scoring.rehab_score;
    rows.push({
      player_id,
      name: p.name,
      group: p.group,
      workouts: c.workouts,
      rehabs: c.rehabs,
      points,
    });
  }

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.workouts !== a.workouts) return b.workouts - a.workouts;
    if (b.rehabs !== a.rehabs) return b.rehabs - a.rehabs;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

/**
 * Fetch + aggregate. Reads visible rows from activity_logs (workouts +
 * rehabs, hidden=false). Optionally filters by `logged_at >= sinceISO` for
 * the weekly window.
 */
export async function computeLeaderboard(
  sb: SupabaseClient,
  teamId: number,
  scoring: TeamScoring,
  sinceISO?: string,
): Promise<LeaderboardRow[]> {
  const { data: playersData } = await sb
    .from('players')
    .select('id,name,group')
    .eq('team_id', teamId)
    .eq('active', true);

  const players: LeaderboardInputPlayer[] = (playersData ?? []) as LeaderboardInputPlayer[];

  let q = sb
    .from('activity_logs')
    .select('player_id,kind')
    .eq('team_id', teamId)
    .in('kind', ['workout', 'rehab'])
    .eq('hidden', false)
    .not('player_id', 'is', null);
  if (sinceISO) q = q.gte('logged_at', sinceISO);

  // Page through results — supabase default LIMIT is 1000, and the team can
  // exceed that on all-time queries.
  const entries: LeaderboardInputEntry[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ player_id: number; kind: string }>) {
      entries.push({ player_id: r.player_id, kind: r.kind });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return aggregateLeaderboard(players, entries, scoring);
}

/**
 * Round a points value to 4 decimal places to suppress IEEE 754
 * accumulation artifacts that surface whenever a competition uses
 * fractional weights (the canonical example: 22 × 0.6 evaluates to
 * 13.200000000000001 in JavaScript, not 13.2). 4 decimals is enough
 * to preserve any real-world scoring config — competitions don't
 * meaningfully need sub-0.0001 point granularity — while killing
 * the float noise at the 10th–15th decimal that was leaking through
 * to the leaderboard UI.
 *
 * Applied in `aggregateCompetition` to base_points, bonus_total, and
 * the summed `points` so every downstream consumer (API responses,
 * athlete-page card, exports, LLM prompts) receives clean numbers.
 */
function roundPoints(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Competition-aware leaderboard row. Carries the per-kind counts so the UI
 * can show "X swims · Y workouts · Z rehabs" alongside the headline points.
 * `bonus_total` is the sum of all signed stacking adjustments applied to
 * this player; surfaced separately so coaches can see how much of the
 * total came from rule triggers vs. base scoring.
 */
export interface CompetitionLeaderboardRow {
  player_id: number;
  name: string;
  group: string | null;
  /** Per-kind counts inside the date window. */
  counts: Record<string, number>;
  /** Sum of base points (counts × scoring[kind]). */
  base_points: number;
  /** Sum of signed adjustments from bonus_rules (positive or negative). */
  bonus_total: number;
  /** base_points + bonus_total. */
  points: number;
}

/**
 * Entry for the competition aggregator. Same as `LeaderboardInputEntry`
 * but includes the day so stacking rules can group by (player, day).
 * `day` should be an ISO date string (YYYY-MM-DD); the caller derives it
 * from `activity_logs.logged_at` truncated to a local timezone.
 */
export interface CompetitionInputEntry {
  player_id: number;
  kind: string;
  day: string;
}

/**
 * Pure competition aggregator. Given the roster, entries inside the
 * competition window, and the competition's scoring + bonus rules, compute
 * the leaderboard.
 *
 * Bonus-rule semantics:
 *   For each (player, day, kind) combination, count occurrences. For each
 *   bonus rule matching that kind, if count >= rule.min_per_day, apply
 *   rule.bonus_points ONCE (not per-extra). Multiple rules on the same
 *   kind compose additively, so coaches can express tiered adjustments
 *   ("≥2 swims = -1, ≥3 swims = -1" → 3 swims in a day eats 2pts).
 *
 * Sort: points DESC → base_points DESC → name ASC. Players with zero
 * scoring contribution (no counted entries) are excluded.
 */
export function aggregateCompetition(
  players: LeaderboardInputPlayer[],
  entries: CompetitionInputEntry[],
  scoring: Record<string, number>,
  bonusRules: CompetitionBonusRule[],
): CompetitionLeaderboardRow[] {
  // Group: player_id → day → kind → count
  const byPlayerDay = new Map<number, Map<string, Map<string, number>>>();
  for (const e of entries) {
    // Silently skip kinds the coach hasn't scored — keeps the aggregator
    // future-proof when new kinds appear in activity_logs before the
    // competition's scoring map is updated.
    if (!(e.kind in scoring)) continue;
    let days = byPlayerDay.get(e.player_id);
    if (!days) { days = new Map(); byPlayerDay.set(e.player_id, days); }
    let kinds = days.get(e.day);
    if (!kinds) { kinds = new Map(); days.set(e.day, kinds); }
    kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  }

  const playerById = new Map(players.map((p) => [p.id, p]));
  const rows: CompetitionLeaderboardRow[] = [];

  for (const [player_id, days] of byPlayerDay) {
    const player = playerById.get(player_id);
    if (!player) continue;  // unknown / removed player — drop

    const counts: Record<string, number> = {};
    let basePoints = 0;
    let bonusTotal = 0;

    for (const [, kindMap] of days) {
      for (const [kind, count] of kindMap) {
        counts[kind] = (counts[kind] ?? 0) + count;
        basePoints += count * (scoring[kind] ?? 0);
      }
      // Apply bonus rules per-day. Each matching rule fires once per
      // (player, day) when the threshold is met, regardless of how
      // many entries are over the threshold.
      for (const rule of bonusRules) {
        const dayCount = kindMap.get(rule.kind) ?? 0;
        if (dayCount >= rule.min_per_day) {
          bonusTotal += rule.bonus_points;
        }
      }
    }

    // Round at the source so float-arithmetic noise (22 × 0.6 →
    // 13.200000000000001 etc.) never reaches the API or the UI.
    // base_points and bonus_total are each rounded independently
    // before being summed, and the sum is rounded again because
    // base + bonus can itself reintroduce a tiny epsilon.
    const baseRounded = roundPoints(basePoints);
    const bonusRounded = roundPoints(bonusTotal);
    rows.push({
      player_id,
      name: player.name,
      group: player.group,
      counts,
      base_points: baseRounded,
      bonus_total: bonusRounded,
      points: roundPoints(baseRounded + bonusRounded),
    });
  }

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.base_points !== a.base_points) return b.base_points - a.base_points;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

/**
 * Fetch + aggregate against a specific competition. Pulls `activity_logs`
 * inside [competition.starts_at, competition.ends_at] and runs them
 * through `aggregateCompetition`. Returns a row per player who has at
 * least one counted entry in the window.
 */
export async function computeCompetitionLeaderboard(
  sb: SupabaseClient,
  competition: Competition,
): Promise<CompetitionLeaderboardRow[]> {
  const { data: playersData } = await sb
    .from('players')
    .select('id,name,group')
    .eq('team_id', competition.team_id)
    .eq('active', true);
  const players = (playersData ?? []) as LeaderboardInputPlayer[];

  // We need logged_at to derive `day`; selecting kind + logged_at +
  // player_id keeps the payload narrow. The half-open date range
  // [starts_at, ends_at + 1 day) is implemented as <= ends_at on a
  // date column because logged_at is timestamptz — anything on the
  // ends_at calendar day inclusive is counted by adding 'T23:59:59'
  // to the upper bound.
  const lowerISO = competition.starts_at;
  const upperISO = competition.ends_at + 'T23:59:59';

  const entries: CompetitionInputEntry[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from('activity_logs')
      .select('player_id, kind, logged_at')
      .eq('team_id', competition.team_id)
      .eq('hidden', false)
      .not('player_id', 'is', null)
      .gte('logged_at', lowerISO)
      .lte('logged_at', upperISO)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ player_id: number; kind: string; logged_at: string }>) {
      // Day key in the team's own time zone would be more accurate, but
      // we don't store team timezone yet; UTC date slice is good enough
      // for typical "American university 9am-9pm" patterns and keeps the
      // function pure / testable.
      const day = r.logged_at.slice(0, 10);
      entries.push({ player_id: r.player_id, kind: r.kind, day });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return aggregateCompetition(players, entries, competition.scoring, competition.bonus_rules);
}

const SERIES_DAY_MS = 86_400_000;

function dayDiffISO(aISO: string, bISO: string): number {
  const a = Date.parse(aISO + 'T00:00:00Z');
  const b = Date.parse(bISO + 'T00:00:00Z');
  return Math.round((b - a) / SERIES_DAY_MS);
}

function addDaysISO(iso: string, n: number): string {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * SERIES_DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export interface SeriesAxis {
  /** Bucket start day per bucket, ISO YYYY-MM-DD, ascending. */
  buckets: string[];
  granularity: 'day' | 'week';
}

/**
 * Build the bucket axis for a competition window [startISO, endISO] (inclusive).
 * ≤ 35 days → one bucket per day. > 35 days → weekly buckets anchored to the
 * start day (bucket k covers [start + 7k, start + 7k + 6]).
 */
export function buildBucketAxis(startISO: string, endISO: string): SeriesAxis {
  const span = dayDiffISO(startISO, endISO) + 1; // inclusive day count
  if (span <= 35) {
    const buckets = Array.from({ length: Math.max(1, span) }, (_, i) => addDaysISO(startISO, i));
    return { buckets, granularity: 'day' };
  }
  const weeks = Math.ceil(span / 7);
  const buckets = Array.from({ length: weeks }, (_, i) => addDaysISO(startISO, i * 7));
  return { buckets, granularity: 'week' };
}

/**
 * Resolve the [startISO, endISO] window to display for a competition + period.
 * `end` is today for an ongoing competition, else `ends_at` (so finished
 * competitions show their final N days, not an empty future window); if the
 * competition hasn't started, `end` clamps up to `starts_at`. For a numeric
 * period, `start` = end − (N−1) days, clamped to never precede `starts_at`
 * (a window longer than the competition → the whole competition). `'all'`
 * returns the full competition window.
 */
export function competitionWindow(
  competition: Pick<Competition, 'starts_at' | 'ends_at'>,
  period: Period,
  todayISO: string,
): { startISO: string; endISO: string } {
  const rawEnd = competition.ends_at < todayISO ? competition.ends_at : todayISO;
  const endISO = rawEnd < competition.starts_at ? competition.starts_at : rawEnd;
  if (period === 'all') {
    return { startISO: competition.starts_at, endISO };
  }
  const candidateStart = addDaysISO(endISO, -(period - 1));
  const startISO = candidateStart < competition.starts_at ? competition.starts_at : candidateStart;
  return { startISO, endISO };
}

function bucketIndexFor(dayISO: string, startISO: string, granularity: 'day' | 'week'): number {
  const d = dayDiffISO(startISO, dayISO);
  if (d < 0) return -1;
  return granularity === 'day' ? d : Math.floor(d / 7);
}

/** One athlete's score over the bucket axis. */
export interface CompetitionSeriesRow {
  player_id: number;
  name: string;
  group: string | null;
  /** Points earned per bucket, index-aligned with the axis. */
  perBucket: number[];
  /** Running sum of perBucket (rounded). */
  cumulative: number[];
  /** Final cumulative value; equals the player's leaderboard points. */
  total: number;
}

/**
 * Pure time-series aggregator. Reuses the per-(player, day) base+bonus logic
 * from `aggregateCompetition`: bonuses fire per day before days are rolled into
 * their bucket, so `total` matches the leaderboard exactly. Players with no
 * counted entries are excluded; rows sort by total DESC → name ASC.
 */
export function aggregateCompetitionSeries(
  players: LeaderboardInputPlayer[],
  entries: CompetitionInputEntry[],
  scoring: Record<string, number>,
  bonusRules: CompetitionBonusRule[],
  axis: SeriesAxis,
): CompetitionSeriesRow[] {
  const start = axis.buckets[0];
  // player_id → day → kind → count
  const byPlayerDay = new Map<number, Map<string, Map<string, number>>>();
  for (const e of entries) {
    if (!(e.kind in scoring)) continue;
    let days = byPlayerDay.get(e.player_id);
    if (!days) { days = new Map(); byPlayerDay.set(e.player_id, days); }
    let kinds = days.get(e.day);
    if (!kinds) { kinds = new Map(); days.set(e.day, kinds); }
    kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  }

  const playerById = new Map(players.map((p) => [p.id, p]));
  const rows: CompetitionSeriesRow[] = [];

  for (const [player_id, days] of byPlayerDay) {
    const player = playerById.get(player_id);
    if (!player) continue;

    const perBucket = new Array(axis.buckets.length).fill(0);
    let basePoints = 0;
    let bonusTotal = 0;

    for (const [day, kindMap] of days) {
      const idx = bucketIndexFor(day, start, axis.granularity);
      if (idx < 0 || idx >= perBucket.length) continue;
      let dayPoints = 0;
      for (const [kind, count] of kindMap) {
        const base = count * (scoring[kind] ?? 0);
        basePoints += base;
        dayPoints += base;
      }
      for (const rule of bonusRules) {
        const dayCount = kindMap.get(rule.kind) ?? 0;
        if (dayCount >= rule.min_per_day) {
          bonusTotal += rule.bonus_points;
          dayPoints += rule.bonus_points;
        }
      }
      perBucket[idx] += dayPoints;
    }

    const cumulative: number[] = [];
    let run = 0;
    for (const v of perBucket) { run += v; cumulative.push(roundPoints(run)); }

    rows.push({
      player_id,
      name: player.name,
      group: player.group,
      perBucket: perBucket.map(roundPoints),
      cumulative,
      total: roundPoints(roundPoints(basePoints) + roundPoints(bonusTotal)),
    });
  }

  rows.sort((a, b) => (b.total !== a.total ? b.total - a.total : a.name.localeCompare(b.name)));
  return rows;
}

/**
 * Fetch + aggregate a competition's per-bucket score series. Pulls the same
 * windowed activity_logs rows as `computeCompetitionLeaderboard`, clamps the
 * right edge to today for in-progress competitions, and buckets daily/weekly
 * by window length.
 */
export async function computeCompetitionSeries(
  sb: SupabaseClient,
  competition: Competition,
  period: Period = 'all',
): Promise<{ rows: CompetitionSeriesRow[]; bucketAxis: string[]; granularity: 'day' | 'week' }> {
  const { data: playersData } = await sb
    .from('players')
    .select('id,name,group')
    .eq('team_id', competition.team_id)
    .eq('active', true);
  const players = (playersData ?? []) as LeaderboardInputPlayer[];

  // Resolve the display window for the selected period. A narrow window also
  // makes buildBucketAxis switch to daily buckets, and aggregating only
  // in-window entries makes each athlete's total (and the ranking) reflect
  // just that window.
  const today = todayCT();
  const { startISO, endISO } = competitionWindow(competition, period, today);

  const axis = buildBucketAxis(startISO, endISO);

  const lowerISO = startISO;
  const upperISO = endISO + 'T23:59:59';

  const entries: CompetitionInputEntry[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from('activity_logs')
      .select('player_id, kind, logged_at')
      .eq('team_id', competition.team_id)
      .eq('hidden', false)
      .not('player_id', 'is', null)
      .gte('logged_at', lowerISO)
      .lte('logged_at', upperISO)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ player_id: number; kind: string; logged_at: string }>) {
      entries.push({ player_id: r.player_id, kind: r.kind, day: r.logged_at.slice(0, 10) });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const rows = aggregateCompetitionSeries(
    players,
    entries,
    competition.scoring,
    competition.bonus_rules,
    axis,
  );
  return { rows, bucketAxis: axis.buckets, granularity: axis.granularity };
}

/**
 * Today's calendar date (YYYY-MM-DD) in America/Chicago. Competition
 * starts_at/ends_at are plain dates meant to run to Chicago midnight;
 * comparing them against a UTC "today" flipped competitions (and the
 * activity kinds they unlock) on/off ~6h early each evening.
 */
export function todayCT(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * The instant of the most recent Monday 00:00 in America/Chicago, expressed
 * as a UTC `Date`. Used as the lower bound for the weekly leaderboard.
 */
export function weekStartCT(): Date {
  const now = new Date();
  // Format current instant as CT components using sv-SE which produces "YYYY-MM-DD HH:mm:ss"
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const isoLocal = fmt.format(now).replace(' ', 'T');
  const ctNow = new Date(isoLocal + 'Z'); // treat as UTC instant (it represents CT wall-clock)
  const day = ctNow.getUTCDay(); // 0 Sun..6 Sat
  const daysSinceMonday = (day + 6) % 7;
  ctNow.setUTCDate(ctNow.getUTCDate() - daysSinceMonday);
  ctNow.setUTCHours(0, 0, 0, 0);
  // Convert the CT wall-clock back to a real UTC instant
  const offsetMs = now.getTime() - new Date(fmt.format(now).replace(' ', 'T') + 'Z').getTime();
  return new Date(ctNow.getTime() + offsetMs);
}
