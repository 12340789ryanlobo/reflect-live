# Competition Trends — Window Filter

**Status:** approved 2026-06-18
**Scope:** Add a `[ 7d · 30d · Full ]` window toggle to the competition Trends card
so a coach can zoom the trend to a recent window at daily resolution. Builds on
`2026-06-18-competition-score-trends-design.md`.

**Files affected:**
- `apps/web/src/lib/scoring.ts` — add pure `competitionWindow(competition,
  period, todayISO)`; give `computeCompetitionSeries` a `period: Period` arg.
- `apps/web/src/lib/scoring-competition.test.ts` — unit tests for
  `competitionWindow`.
- `apps/web/src/components/v3/competition-trends-card.tsx` — period state +
  segmented toggle.

## Why

The Trends card currently always spans the whole competition; long competitions
bucket weekly, so a coach can't see fine recent detail or answer "who's been
active *this week*". A window filter narrows the view; because the window is
short, the existing adaptive bucketing switches to **daily** — that's the "more
detail" — with no new bucketing code.

## Behavior

- Toggle presets: **7d**, **30d**, **Full** (`Period` values `7`, `30`, `'all'`).
  Default **Full** = today's whole-competition behavior, unchanged.
- A window narrows both the fetch and the bucket axis. Because only in-window
  entries are aggregated, each athlete's `total` becomes their **in-window**
  points and the existing `total DESC` sort **re-ranks by window activity** — a
  season leader who's gone quiet drops; recent movers rise. No new cumulative
  logic. (Cadence view is per-bucket already, so it just shows fewer, daily cells.)
- Header shows a hint when a window is active, e.g. "ranked by last 7 days".
- Empty window → existing empty state.

## Window anchoring (the one nuance)

"Last N days" = the most recent N days **of the competition**, via pure
`competitionWindow(competition, period, todayISO)`:

- `end` = `today` if the competition is ongoing, else `ends_at` (so finished
  competitions show their final N days, not an empty future window). If the
  competition hasn't started (`today < starts_at`), `end` clamps up to
  `starts_at`.
- `start` = `'all'` → `starts_at`; otherwise `end − (N−1)` days, clamped so it
  never precedes `starts_at` (a window longer than the competition → the whole
  competition).

`computeCompetitionSeries` calls `competitionWindow`, then `buildBucketAxis` over
`[start, end]`, then fetches `activity_logs` in that range and aggregates as today.

## Out of scope

Per-day numeric strips and click-to-drill (deferred — window-zoom only). New
period presets beyond 7/30/Full. URL-persisting the selected window.

## Testing

- Unit tests for `competitionWindow`: ongoing anchor (today), ended anchor
  (`ends_at`), clamp-to-start when window exceeds the competition, `'all'`,
  not-yet-started clamp.
- Manual visual on the live card; toggle 7d/30d/Full and confirm re-ranking +
  daily cells + header hint + empty state.
- DoD: `bun run typecheck`, `bun run lint`, `bun run build:web` clean.
