# Competition Score Trends

**Status:** approved 2026-06-18
**Scope:** Add a "Trends" card to the competition detail page
(`/dashboard/competitions/[id]`) that shows how each athlete's competition
score has moved across the competition window — a ranked, one-row-per-athlete
table with a `[ Trajectory | Cadence ]` toggle that swaps each row's mini-viz.

**Files affected:**
- `apps/web/src/lib/scoring.ts` — add a pure `aggregateCompetitionSeries` and a
  supabase-aware `computeCompetitionSeries`, reusing the existing per-(player,
  day) base+bonus logic already in `aggregateCompetition`.
- `apps/web/src/lib/scoring-competition.test.ts` — unit tests for the new pure
  aggregator (bucketing, cumulative sum, per-day bonus roll-up).
- `apps/web/src/components/v3/competition-trends-card.tsx` — new component.
- `apps/web/src/app/dashboard/competitions/[id]/page.tsx` — render the card
  below the existing Leaderboard section.

## Origin

Recovered inbox note (lost in the 2026-05-18 teleport, restored to `IDEAS.md`):

> "team activity page, competition list could have an additional view of seeing
> lines of athletes and how their scores have changed over time"

This is the cross-athlete view explicitly deferred in
`2026-05-02-score-trends-heatmap-design.md` under *Out of scope*: "Cross-athlete
comparison (coach-only feature, separate scope)." That spec built a per-athlete
survey-score heatmap; this is its team-level sibling for competition activity.

## Why this exists

The competition leaderboard is a static snapshot — it answers "who's ahead
right now" but hides trajectory. A coach can't see who's pulling away, who
stalled three weeks ago, or who's quietly gone silent. This card adds the
time dimension the leaderboard lacks, in two readings a coach actually uses:
who's winning the race (trajectory) and who's consistent vs. dropping off
(cadence).

## Layout

A new card below the Leaderboard. One ranked row per athlete (ranked by total
competition points, same order as the leaderboard). The header carries the
view toggle; each row carries name, a mini-viz strip, and the total.

```
┌───────────────────────────────────────────────────────────────┐
│ Trends                                  [ Trajectory | Cadence ]│
├───────────────────────────────────────────────────────────────┤
│ 1  Alex    ╱▁╱▁▁▁ ↗                                   42 pt     │
│ 2  Sam     ▁╱▁╱▁▁ ↗                                   38 pt     │
│ 3  Jo      ▁▁╱▁▁▁ →                                   31 pt     │
│ 4  Priya   ▁▁▁▁▁▁ →                                   12 pt     │
│            Apr 1                                Apr 30          │
└───────────────────────────────────────────────────────────────┘
   (Trajectory shown: per-row sparkline of cumulative points)
```

Rationale for a separate card (vs. a column inside the leaderboard table): the
leaderboard table already carries per-kind count columns + bonus + points;
adding a wide viz column would force horizontal scroll and crowd the numbers.
A separate card also mirrors the athlete page, which pairs a Leaderboard with a
separate "Score trends" card — same mental model.

## The two views (toggle)

**Trajectory** — default. Each row renders a `Sparkline` of that athlete's
**cumulative** competition points across the window. Shows the race: a line
climbing steeply is pulling ahead; a flat line has stalled. A small trend glyph
(`↗` rising / `→` flat / `↘` — only meaningful if a competition can subtract
points via negative bonus rules) and the last cumulative value sit to the right.

**Cadence** — each row renders a heatmap-strip, one cell per time bucket, cell
tone = **points earned in that bucket**, using the discrete 4-bucket tone scale
from `survey-trends-card.tsx`. Blank/faint cell = nothing logged that bucket.
Shows consistency vs. drop-off at a glance.

Default is Trajectory because a competition is inherently a race.

## Time buckets (adaptive)

Window is always the competition's `starts_at → ends_at`, clamped on the right
to "today" for an in-progress competition (so we never draw empty future
buckets).

- Window ≤ 35 days → **daily** buckets.
- Window > 35 days → **weekly** buckets, anchored to the competition's start day
  (bucket *k* = days `[start + 7k, start + 7k + 6]`). Start-anchoring keeps
  buckets gap-free and avoids a ragged partial first week.

This keeps heatmap cells ≥ ~4px wide and sparklines from getting noisy on long
competitions.

Bonus rules are evaluated per-(player, day) regardless of bucket size: the
aggregator always computes day-level points first (so per-day bonus thresholds
fire correctly), then rolls days up into the active bucket.

## Cell / sparkline encoding

**Trajectory sparkline:** `data = cumulative[]`. Reuse the existing `Sparkline`
component as-is (`showDots` off, last-point dot on). The right-hand label shows
the final cumulative value formatted like the leaderboard (`toFixed(0|1)`).

**Cadence cells (per bucket):**

| Bucket points | Cell |
|---|---|
| 0 (nothing logged) | faint background dot |
| `> 0`, low third of this competition's per-bucket range | red→amber square |
| middle third | amber square |
| top third | green square |

Tone uses a discrete red→amber→green scale (the survey-trends card's `scoreTone`
treatment, adapted to discrete buckets for legibility at small cell sizes),
scaled to *this competition's* observed per-bucket points (not a fixed 1–10
scale), since competition point magnitudes vary by scoring config. Each cell has
a title tooltip: `<bucket date>: <points> pt`.

## Data layer

Two additions to `lib/scoring.ts`, mirroring the existing
`aggregateCompetition` / `computeCompetitionLeaderboard` pair.

```ts
export interface CompetitionSeriesRow {
  player_id: number;
  name: string;
  group: string | null;
  /** Points earned per bucket, index-aligned with the bucket axis. */
  perBucket: number[];
  /** Running sum of perBucket. */
  cumulative: number[];
  /** Total = last cumulative value (== leaderboard points for the window). */
  total: number;
}

export interface SeriesOptions {
  /** Ordered bucket boundaries as ISO day strings (YYYY-MM-DD). Each entry's
   *  day is assigned to the latest boundary <= it. */
  buckets: string[];          // length N
  granularity: 'day' | 'week';
}

export function aggregateCompetitionSeries(
  players: LeaderboardInputPlayer[],
  entries: CompetitionInputEntry[],   // {player_id, kind, day}
  scoring: Record<string, number>,
  bonusRules: CompetitionBonusRule[],
  opts: SeriesOptions,
): CompetitionSeriesRow[];

export async function computeCompetitionSeries(
  sb: SupabaseClient,
  competition: Competition,
): Promise<{ rows: CompetitionSeriesRow[]; bucketAxis: string[]; granularity: 'day' | 'week' }>;
```

- `aggregateCompetitionSeries` reuses the exact per-(player, day) counting and
  per-day bonus-rule firing from `aggregateCompetition`, then assigns each day's
  points to its bucket and accumulates. Pure → unit-tested.
- `computeCompetitionSeries` fetches the same narrow `player_id, kind,
  logged_at` rows in `[starts_at, ends_at + 'T23:59:59']` that
  `computeCompetitionLeaderboard` already pages through, derives `day =
  logged_at.slice(0,10)`, builds the bucket axis (daily/weekly per the window),
  and calls the pure aggregator. Reuses `roundPoints` so totals match the
  leaderboard exactly.
- Sort: `total` DESC → `name` ASC (same tiebreak family as the leaderboard).
  Players with zero counted entries are excluded, matching the leaderboard.

## Component

`apps/web/src/components/v3/competition-trends-card.tsx`

- `<CompetitionTrendsCard competition={comp} />`.
- Owns toggle state (`'trajectory' | 'cadence'`, default `'trajectory'`).
- Calls `computeCompetitionSeries(sb, competition)` on mount (and exposes the
  same refetch hook the page uses after archive/score changes — see below).
- Renders ranked rows; Trajectory rows use `Sparkline`, Cadence rows use a
  heatmap-strip lifted from the `survey-trends-card` cell pattern.
- A single shared bottom date axis (start … end), like the survey trends card.

## States & edges

- **Empty** (no scored activity in window): "— no scored activity in this
  competition yet —".
- **Single athlete / sparse**: still renders; a flat sparkline is honest.
- **In-progress competition**: right-clamp buckets to today.
- **Mobile**: the heatmap-strip column scrolls horizontally; sparklines are
  fixed-width and need no scroll.
- **Refetch**: load on mount; re-run when the competition's leaderboard
  refetches (archive toggle, scoring edit). No realtime subscription in v1.

## Testing

- Unit tests for `aggregateCompetitionSeries` in
  `scoring-competition.test.ts`: daily vs. weekly bucketing, cumulative is a
  correct running sum, per-day bonus rules fire before bucket roll-up, totals
  equal `aggregateCompetition` totals for the same inputs, empty/sparse inputs.
- Manual visual check on a live competition page after deploy.
- Definition of done (from CLAUDE.md): `bun run typecheck`, `bun run lint`,
  `bun run build:web` all clean before commit.

## Out of scope (v1)

- Team-wide (non-competition) activity trends.
- The PR / volume / weight capture idea (separate feature, separate inbox note).
- Cross-competition comparison.
- Click-to-drill on a cell / per-day detail dialog.
- CSV export and realtime live updates.
