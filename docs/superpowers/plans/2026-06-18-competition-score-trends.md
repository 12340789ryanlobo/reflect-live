# Competition Score Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Trends" card to `/dashboard/competitions/[id]` showing each athlete's competition score over the competition window, with a `[ Trajectory | Cadence ]` toggle (cumulative-points sparkline vs. per-bucket activity heatmap-strip), one ranked row per athlete.

**Architecture:** A pure time-series aggregator beside the existing competition scoring functions in `lib/scoring.ts` (reusing the per-(player, day) base+bonus logic from `aggregateCompetition`), a thin supabase-aware fetch wrapper, and one client component that reuses the existing `Sparkline` and the survey-trends heatmap-cell pattern. No DB, API, or schema changes.

**Tech Stack:** Next.js 16 App Router (client component), TypeScript, Supabase JS client, `bun test` (vitest-compatible) for the pure aggregator.

**Spec:** `docs/superpowers/specs/2026-06-18-competition-score-trends-design.md`

---

## File Structure

- **Modify** `apps/web/src/lib/scoring.ts` — add `CompetitionSeriesRow`, `SeriesAxis`, helpers `buildBucketAxis` / `bucketIndexFor`, pure `aggregateCompetitionSeries`, and supabase-aware `computeCompetitionSeries`. Append after `computeCompetitionLeaderboard`.
- **Modify** `apps/web/src/lib/scoring-competition.test.ts` — add a `describe('aggregateCompetitionSeries')` block and a `describe('buildBucketAxis')` block.
- **Create** `apps/web/src/components/v3/competition-trends-card.tsx` — the `<CompetitionTrendsCard competition={comp} />` component (both views + toggle).
- **Modify** `apps/web/src/app/dashboard/competitions/[id]/page.tsx` — import and render the card below the existing Leaderboard `<section>`.

---

## Task 1: Pure aggregator — daily buckets, cumulative, per-day bonus roll-up

**Files:**
- Modify: `apps/web/src/lib/scoring.ts` (append after `computeCompetitionLeaderboard`, ~line 340)
- Test: `apps/web/src/lib/scoring-competition.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/scoring-competition.test.ts`. (The file already imports `aggregateCompetition`, `CompetitionInputEntry`, `LeaderboardInputPlayer` from `./scoring` and `CompetitionBonusRule` from `@reflect-live/shared`; extend the `./scoring` import with `aggregateCompetitionSeries` and `buildBucketAxis`.)

```ts
import {
  aggregateCompetition,
  aggregateCompetitionSeries,
  buildBucketAxis,
  type CompetitionInputEntry,
  type LeaderboardInputPlayer,
} from './scoring';

const SERIES_PLAYERS: LeaderboardInputPlayer[] = [
  { id: 1, name: 'Alex', group: 'A' },
  { id: 2, name: 'Sam', group: 'B' },
];

describe('aggregateCompetitionSeries — daily', () => {
  const axis = buildBucketAxis('2026-04-01', '2026-04-03'); // 3 daily buckets

  test('buckets points by day and accumulates', () => {
    const entries: CompetitionInputEntry[] = [
      { player_id: 1, kind: 'swim', day: '2026-04-01' },
      { player_id: 1, kind: 'swim', day: '2026-04-03' },
    ];
    const rows = aggregateCompetitionSeries(SERIES_PLAYERS, entries, { swim: 2 }, [], axis);
    expect(rows).toHaveLength(1);
    expect(rows[0].player_id).toBe(1);
    expect(rows[0].perBucket).toEqual([2, 0, 2]);
    expect(rows[0].cumulative).toEqual([2, 2, 4]);
    expect(rows[0].total).toBe(4);
  });

  test('per-day bonus fires before roll-up (2 swims same day = one bonus)', () => {
    const entries: CompetitionInputEntry[] = [
      { player_id: 1, kind: 'swim', day: '2026-04-01' },
      { player_id: 1, kind: 'swim', day: '2026-04-01' },
    ];
    const rules = [{ kind: 'swim', min_per_day: 2, bonus_points: 1 }];
    const rows = aggregateCompetitionSeries(SERIES_PLAYERS, entries, { swim: 2 }, rules, axis);
    // 2 swims * 2 + one bonus = 5, all in bucket 0
    expect(rows[0].perBucket).toEqual([5, 0, 0]);
    expect(rows[0].total).toBe(5);
  });

  test('same two swims split across days do NOT trigger the bonus', () => {
    const entries: CompetitionInputEntry[] = [
      { player_id: 1, kind: 'swim', day: '2026-04-01' },
      { player_id: 1, kind: 'swim', day: '2026-04-02' },
    ];
    const rules = [{ kind: 'swim', min_per_day: 2, bonus_points: 1 }];
    const rows = aggregateCompetitionSeries(SERIES_PLAYERS, entries, { swim: 2 }, rules, axis);
    expect(rows[0].perBucket).toEqual([2, 2, 0]);
    expect(rows[0].total).toBe(4);
  });

  test('total equals aggregateCompetition total for the same inputs', () => {
    const entries: CompetitionInputEntry[] = [
      { player_id: 1, kind: 'swim', day: '2026-04-01' },
      { player_id: 1, kind: 'lift', day: '2026-04-02' },
      { player_id: 2, kind: 'swim', day: '2026-04-02' },
    ];
    const scoring = { swim: 2, lift: 0.5 };
    const rules = [{ kind: 'swim', min_per_day: 1, bonus_points: 0.25 }];
    const series = aggregateCompetitionSeries(SERIES_PLAYERS, entries, scoring, rules, axis);
    const board = aggregateCompetition(SERIES_PLAYERS, entries, scoring, rules);
    for (const row of series) {
      const match = board.find((b) => b.player_id === row.player_id)!;
      expect(row.total).toBe(match.points);
    }
  });

  test('excludes players with no counted entries; sorts by total desc', () => {
    const entries: CompetitionInputEntry[] = [
      { player_id: 2, kind: 'swim', day: '2026-04-01' },
      { player_id: 1, kind: 'swim', day: '2026-04-01' },
      { player_id: 1, kind: 'swim', day: '2026-04-02' },
    ];
    const rows = aggregateCompetitionSeries(SERIES_PLAYERS, entries, { swim: 2 }, [], axis);
    expect(rows.map((r) => r.player_id)).toEqual([1, 2]); // Alex (4) before Sam (2)
  });

  test('empty entries → empty rows', () => {
    expect(aggregateCompetitionSeries(SERIES_PLAYERS, [], { swim: 2 }, [], axis)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun --cwd apps/web test src/lib/scoring-competition.test.ts`
Expected: FAIL — `aggregateCompetitionSeries` / `buildBucketAxis` are not exported yet (import error or "is not a function").

- [ ] **Step 3: Implement the types, helpers, and aggregator**

Append to `apps/web/src/lib/scoring.ts` (after `computeCompetitionLeaderboard`, before `weekStartCT`). `roundPoints`, `CompetitionInputEntry`, `LeaderboardInputPlayer`, and `CompetitionBonusRule` already exist in this file's scope.

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun --cwd apps/web test src/lib/scoring-competition.test.ts`
Expected: PASS — all existing 19 tests plus the new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/scoring.ts apps/web/src/lib/scoring-competition.test.ts
git commit -m "feat(scoring): aggregateCompetitionSeries — per-bucket competition score time series"
```

---

## Task 2: `buildBucketAxis` daily/weekly boundary tests

**Files:**
- Test: `apps/web/src/lib/scoring-competition.test.ts`

(The implementation already landed in Task 1; this task locks its behavior with explicit boundary tests.)

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/scoring-competition.test.ts`:

```ts
describe('buildBucketAxis', () => {
  test('≤35-day window → daily buckets, one per inclusive day', () => {
    const axis = buildBucketAxis('2026-04-01', '2026-04-10');
    expect(axis.granularity).toBe('day');
    expect(axis.buckets).toHaveLength(10);
    expect(axis.buckets[0]).toBe('2026-04-01');
    expect(axis.buckets[9]).toBe('2026-04-10');
  });

  test('36-day window → weekly buckets anchored to start', () => {
    const axis = buildBucketAxis('2026-04-01', '2026-05-06'); // 36 inclusive days
    expect(axis.granularity).toBe('week');
    expect(axis.buckets).toHaveLength(6); // ceil(36/7)
    expect(axis.buckets[0]).toBe('2026-04-01');
    expect(axis.buckets[1]).toBe('2026-04-08');
  });

  test('single-day window → one daily bucket', () => {
    const axis = buildBucketAxis('2026-04-01', '2026-04-01');
    expect(axis.granularity).toBe('day');
    expect(axis.buckets).toEqual(['2026-04-01']);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun --cwd apps/web test src/lib/scoring-competition.test.ts`
Expected: PASS (implementation already exists from Task 1).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/scoring-competition.test.ts
git commit -m "test(scoring): lock buildBucketAxis daily/weekly boundary"
```

---

## Task 3: `computeCompetitionSeries` — supabase fetch wrapper

**Files:**
- Modify: `apps/web/src/lib/scoring.ts` (append after `aggregateCompetitionSeries`)

No unit test: this mirrors `computeCompetitionLeaderboard`, which is also untested (it's I/O glue; the pure aggregator carries the logic + tests). Verified by `bun run typecheck`.

- [ ] **Step 1: Implement the fetch wrapper**

`Competition` is already imported at the top of `scoring.ts` (`import type { Competition, CompetitionBonusRule } from '@reflect-live/shared';`). Append:

```ts
/**
 * Fetch + aggregate a competition's per-bucket score series. Pulls the same
 * windowed activity_logs rows as `computeCompetitionLeaderboard`, clamps the
 * right edge to today for in-progress competitions, and buckets daily/weekly
 * by window length.
 */
export async function computeCompetitionSeries(
  sb: SupabaseClient,
  competition: Competition,
): Promise<{ rows: CompetitionSeriesRow[]; bucketAxis: string[]; granularity: 'day' | 'week' }> {
  const { data: playersData } = await sb
    .from('players')
    .select('id,name,group')
    .eq('team_id', competition.team_id)
    .eq('active', true);
  const players = (playersData ?? []) as LeaderboardInputPlayer[];

  // Clamp the right edge to today so in-progress competitions don't draw empty
  // future buckets. Never let the end fall before the start.
  const today = new Date().toISOString().slice(0, 10);
  const clamped = competition.ends_at < today ? competition.ends_at : today;
  const effectiveEnd = clamped < competition.starts_at ? competition.starts_at : clamped;

  const axis = buildBucketAxis(competition.starts_at, effectiveEnd);

  const lowerISO = competition.starts_at;
  const upperISO = effectiveEnd + 'T23:59:59';

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
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/scoring.ts
git commit -m "feat(scoring): computeCompetitionSeries — windowed fetch for the trend card"
```

---

## Task 4: `CompetitionTrendsCard` component (both views + toggle)

**Files:**
- Create: `apps/web/src/components/v3/competition-trends-card.tsx`

Verified by typecheck + lint (the app has no React component test harness; v3 components are verified this way + manual visual check, per the spec).

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/v3/competition-trends-card.tsx` with the complete file:

```tsx
'use client';

// Competition score trends — one ranked row per athlete with a
// [ Trajectory | Cadence ] toggle. Trajectory = cumulative-points sparkline;
// Cadence = per-bucket activity heatmap-strip. See
// docs/superpowers/specs/2026-06-18-competition-score-trends-design.md

import { useEffect, useMemo, useState } from 'react';
import type { Competition } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Sparkline } from '@/components/sparkline';
import { computeCompetitionSeries, type CompetitionSeriesRow } from '@/lib/scoring';

type View = 'trajectory' | 'cadence';

function shortDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function fmtPts(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

// Discrete red→amber→green tone scaled to this competition's per-bucket max.
function cadenceTone(v: number, max: number): string {
  if (v <= 0) return 'var(--border)';
  const r = max > 0 ? v / max : 1;
  if (r <= 1 / 3) return 'var(--red)';
  if (r <= 2 / 3) return 'var(--amber)';
  return 'var(--green)';
}

export function CompetitionTrendsCard({ competition }: { competition: Competition }) {
  const sb = useSupabase();
  const [view, setView] = useState<View>('trajectory');
  const [rows, setRows] = useState<CompetitionSeriesRow[]>([]);
  const [axis, setAxis] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { rows, bucketAxis } = await computeCompetitionSeries(sb, competition);
      if (cancelled) return;
      setRows(rows);
      setAxis(bucketAxis);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, competition.id, competition.starts_at, competition.ends_at]);

  const cadenceMax = useMemo(
    () => rows.reduce((m, r) => Math.max(m, ...r.perBucket), 0),
    [rows],
  );

  return (
    <section
      className="reveal reveal-2 rounded-2xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-bold text-[color:var(--ink)]">Trends</h2>
        <div
          className="inline-flex rounded-lg border p-0.5 text-[12px] font-semibold"
          style={{ borderColor: 'var(--border)' }}
        >
          {(['trajectory', 'cadence'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className="rounded-md px-3 py-1 capitalize transition"
              style={
                view === v
                  ? { background: 'var(--blue)', color: 'white' }
                  : { color: 'var(--ink-mute)' }
              }
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
      ) : rows.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
          — no scored activity in this competition yet —
        </p>
      ) : (
        <div className="px-2 md:px-4 py-3">
          {rows.map((row, i) => (
            <div key={row.player_id} className="flex items-center gap-3 px-4 py-2">
              <span className="tabular w-6 text-center text-[13px] font-bold text-[color:var(--ink-mute)]">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[color:var(--ink)]">
                {row.name}
              </span>

              <div className="flex w-[200px] shrink-0 items-center justify-end">
                {view === 'trajectory' ? (
                  <Sparkline
                    data={row.cumulative}
                    width={180}
                    height={26}
                    stroke="var(--blue)"
                    fill="var(--blue)"
                    showDots
                  />
                ) : (
                  <div
                    className="grid w-[180px] gap-[1.5px]"
                    style={{
                      gridTemplateColumns: `repeat(${row.perBucket.length}, minmax(0, 1fr))`,
                      height: 22,
                    }}
                  >
                    {row.perBucket.map((v, b) => (
                      <div
                        key={b}
                        className="rounded-[2px]"
                        title={`${shortDate(axis[b] ?? '')}: ${fmtPts(v)} pt`}
                        style={{
                          background: cadenceTone(v, cadenceMax),
                          opacity: v <= 0 ? 0.4 : 0.92,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <span className="tabular w-14 shrink-0 text-right text-[14px] font-bold text-[color:var(--ink)]">
                {fmtPts(row.total)}
                <span className="ml-1 text-[11px] font-medium text-[color:var(--ink-mute)]">pt</span>
              </span>
            </div>
          ))}

          {axis.length > 1 && (
            <div className="flex items-center justify-between px-4 pt-1.5">
              <span className="ml-9 mono text-[10px] tabular text-[color:var(--ink-mute)]">
                {shortDate(axis[0])}
              </span>
              <span className="mono text-[10px] tabular text-[color:var(--ink-mute)]">
                {shortDate(axis[axis.length - 1])}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: clean (no rules-of-hooks or unused-var errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/v3/competition-trends-card.tsx
git commit -m "feat(ui): CompetitionTrendsCard — trajectory + cadence views"
```

---

## Task 5: Render the card on the competition page + full DoD

**Files:**
- Modify: `apps/web/src/app/dashboard/competitions/[id]/page.tsx`

- [ ] **Step 1: Import the component**

Add to the import block near the top of `apps/web/src/app/dashboard/competitions/[id]/page.tsx` (after the existing `dashboard-shell` import, ~line 11):

```tsx
import { CompetitionTrendsCard } from '@/components/v3/competition-trends-card';
```

- [ ] **Step 2: Render the card below the Leaderboard section**

Find the Leaderboard `<section>` (it opens around line 247 with `{/* Leaderboard */}` and contains `<h2 ...>Leaderboard</h2>`). Immediately **after that section's closing `</section>`**, and while `comp` is in scope (the page only renders this region once `comp` is loaded), add:

```tsx
        {comp && <CompetitionTrendsCard competition={comp} />}
```

If the surrounding container is a flex/grid `gap` stack, the card inherits the spacing automatically. If sections are not in a gap container, wrap with the same `mt-6` (or equivalent) the other sibling sections use — match the existing sibling spacing exactly.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: clean.

- [ ] **Step 5: Build (the real DoD gate)**

Run: `bun run build:web`
Expected: build succeeds.

- [ ] **Step 6: Commit + push**

```bash
git add apps/web/src/app/dashboard/competitions/[id]/page.tsx
git commit -m "feat(ui): show CompetitionTrendsCard on the competition page"
git push
```

- [ ] **Step 7: Manual visual verification**

After Vercel deploys (or `bun run dev:web` locally), open a competition with logged activity:
- Trajectory (default): each athlete row shows a rising cumulative sparkline; ranking matches the leaderboard order; total matches the leaderboard points.
- Toggle to Cadence: each row shows a per-bucket heatmap strip; blank/faint cells where nothing was logged; tooltip on a cell shows `<date>: <pts> pt`.
- A competition with no activity shows the empty state.
- Narrow the viewport: layout stays legible.

---

## Self-Review Notes

- **Spec coverage:** Placement (Task 5), ranked one-row-per-athlete table + toggle (Task 4), Trajectory sparkline default + Cadence heatmap (Task 4), adaptive daily/weekly buckets (Tasks 1–2), per-day bonus roll-up + leaderboard-matching totals (Task 1), supabase fetch + today-clamp (Task 3), empty state (Task 4), mobile (Task 4 fixed-width strips + Step 7 check). All spec sections map to a task.
- **Out of scope** items (team-wide trends, PR/volume capture, cross-competition, click-to-drill, export, realtime) are not implemented, as intended.
- **Type consistency:** `aggregateCompetitionSeries(players, entries, scoring, bonusRules, axis)` and `computeCompetitionSeries(sb, competition) → { rows, bucketAxis, granularity }` and `CompetitionSeriesRow { player_id, name, group, perBucket, cumulative, total }` are used identically across Tasks 1, 3, and 4. `buildBucketAxis` / `SeriesAxis` consistent across Tasks 1–3.
