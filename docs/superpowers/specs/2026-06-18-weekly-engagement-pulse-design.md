# Engagement & Momentum Pulse — design

**Date:** 2026-06-18 · **Status:** approved, ready for plan

## Where this came from

A coach (client), while looking at the **competition pages**, asked: *"Is there
any way to look at team workouts over the last 7 days?"*

The literal ask is trivial — `activity_logs` is already queryable by date. The
real question is **why a coach was on the standings page asking for a recent
activity slice**. The diagnosis:

- A competition leaderboard is a **cumulative scoreboard** over the whole
  `starts_at → ends_at` window. Weeks in, it freezes — early leaders stay on
  top and it stops answering *"who's actually training right now, and who's
  changed?"* Cumulative totals reward early accumulation and hide recent
  movement in either direction.
- The coach was using the leaderboard as a **stand-in for an engagement view**
  because it was the closest thing the app had. (Confirmed with the product
  owner: the intent is managing athletes, not running the game — and the owner
  added that it should show **who's recently doing more *or less* work over a
  configurable "past X days" window**, not just a fixed 7-day drop list.)

So the root problem is: **the app can't show recent training momentum — who's
ramping up, who's dropping off, relative to their own norm, over a window the
coach chooses.** The competition page is just where the coach hit that wall.

### The surface that should already answer this — and why it doesn't

The Dashboard (`apps/web/src/app/dashboard/page.tsx`) already renders a
**"Needs attention"** panel (`apps/web/src/components/v3/needs-attention.tsx`).
It flags two things off `twilio_messages`:

- `low` — latest survey readiness ≤ 4 (a wellness signal — valid, keep it).
- `quiet` — **no inbound message in the last 24 hours**.

That `quiet` rule is the defect:

1. It's **absolute and noisy** — a regular who trains 4×/week but didn't text
   yesterday gets flagged.
2. It measures **texting, not training** — it never reads `activity_logs`.
3. It's **one-directional and fixed-window** — no notion of "doing more," no
   way to change the lookback.

The Dashboard also has a `PeriodToggle` (1 / 7 / 14 / 30 / all) that
`NeedsAttention` currently **ignores**, and a low-value **"Recent activity"**
teaser at the bottom (4 rows that link to the competition page). We reuse the
toggle and repurpose the teaser — **upgrading existing surfaces, not adding new
ones.**

## Goals

- Compute, per athlete, **recent activity vs. their own baseline** from
  `activity_logs`, over a **coach-selectable window** ("past X days").
- Surface **both directions** — who's **heating up ↑** and who's **cooling off
  ↓ / gone quiet** — relative to each athlete's own norm.
- Drive it all from the **existing `PeriodToggle`** so "past X days" is a real
  control.
- **Reduce surfaces, not add them:** upgrade the "Needs attention" panel, swap
  the weak "Recent activity" teaser for a "Movers" card, retire a redundant
  competition widget.

## Non-goals (YAGNI)

- No new page, no new nav item, no new API route, no schema change.
- No nudge/messaging action in v1 (panels deep-link to the athlete page; the
  coach acts manually). Outbound nudging is a possible follow-on.
- No Realtime subscription in v1 — a one-shot fetch on mount (matching current
  `NeedsAttention`) is sufficient; the toggle re-fetches.
- No reuse on the roster page yet — the engine is pure/reusable so that's cheap
  later, but out of scope here.

## Locked decisions

| Decision | Value |
|----------|-------|
| Attention signal | Movement vs. athlete's **own** baseline (not absolute, not coach-target) |
| Window | **Coach-selectable** via the existing `PeriodToggle` (1 / 7 / 14 / 30 / all) |
| Baseline | The **4 windows immediately before** the selected one; `baselineRate = count / 4` = expected per-window count |
| "Regular" floor | `baselineRate ≥ 2` per window (below this, athlete was never consistently engaged) |
| Cooling threshold | `windowCount ≤ baselineRate × 0.5`, and `windowCount > 0` |
| Quiet | Regular (baseline ≥ 2) **and** `windowCount === 0` |
| Heating threshold | `windowCount ≥ MIN_ACTIVE` **and** `windowCount ≥ 1.5 × max(baselineRate, 1)` (surfaces ramping regulars *and* re-activating athletes) |
| What counts as activity | **All** `activity_logs` kinds (workout, rehab, swim, lift, …) — engagement = "showing up at all" |
| Card split | **NeedsAttention** = low readiness + quiet (act-now). **Movers** = ↑ heating / ↓ cooling (the trend). Clean partition, minimal overlap |
| Volume strip on competition page | **Retired**, replaced by a "Team pulse →" breadcrumb |

## Architecture

Three code changes, all inside `apps/web`. No schema change, no migration.

### 1. Engagement engine — `apps/web/src/lib/engagement.ts` (new, pure)

A pure function (no I/O) so it's unit-testable, matching the `scoring.ts` /
`timeline.ts` pattern.

```ts
// Shapes illustrative; match @reflect-live/shared types.
interface EngagementInput {
  players: Array<{ id: number; name: string; group: string | null }>;
  logs: Array<{ player_id: number | null; logged_at: string }>; // non-hidden
  windowDays: number | null; // from PeriodToggle; null = "all"
  now: number;               // ms epoch, injected for testability
}

type Bucket = 'heating' | 'steady' | 'cooling' | 'quiet' | 'new';

interface EngagementRow {
  player_id: number;
  windowCount: number;     // logs in the selected window
  baselineRate: number;    // expected per-window count from the prior 4 windows
  delta: number;           // windowCount − baselineRate (signed; ranks Movers)
  lastActive: string | null;
  bucket: Bucket;
  severity: number;        // |delta|-based; for sorting within a side
}

function computeEngagement(input: EngagementInput): EngagementRow[];
```

Constants at the top of the file, tunable in one place:

```ts
const DAY_MS = 24 * 3600 * 1000;
const BASELINE_WINDOWS = 4;    // compare against the 4 windows before the selected one
const REGULAR_FLOOR = 2;       // baselineRate ≥ this to be "a regular"
const COOLING_RATIO = 0.5;     // windowCount ≤ baseline × this → cooling
const HEATING_RATIO = 1.5;     // windowCount ≥ this × max(baseline,1) → heating
const MIN_ACTIVE = 2;          // heating requires at least this many logs (kills 0→1 noise)
```

**Window math (generalizes the original fixed-7d case):**

- Let `W = windowDays × DAY_MS`.
- `windowCount` = logs in `[now − W, now]`.
- `baselineCount` = logs in `[now − (BASELINE_WINDOWS + 1)·W, now − W]` (the 4
  windows immediately before); `baselineRate = baselineCount / BASELINE_WINDOWS`.
  - `windowDays = 7` → baseline = days 8–35 (prior 4 weeks) — identical to the
    original 7-day design.
  - `windowDays = 30` → baseline = days 31–150; `windowDays = 14` → prior 8
    weeks. Same shape at every scale.
- `delta = windowCount − baselineRate`.

**Bucket logic (per athlete), with `ratio = windowCount / baselineRate`:**

1. **Heating** if `windowCount ≥ MIN_ACTIVE` and
   `windowCount ≥ HEATING_RATIO × max(baselineRate, 1)`. The `max(…, 1)` lets a
   previously-inactive athlete who's now logging show up as heating, not just
   ramping regulars.
2. Else if `baselineRate < REGULAR_FLOOR` → **`new`** (never-engaged or
   brand-new; near-zero baseline). **Not flagged** — they didn't drop, so we
   don't cry wolf.
3. Else if `windowCount === 0` → **`quiet`**.
4. Else if `ratio ≤ COOLING_RATIO` → **`cooling`**.
5. Else → **`steady`**.

The "regular floor" is the single gate for *"do we have enough signal to call a
drop?"* — brand-new and never-engaged athletes both fall below it naturally, so
no separate "new athlete" rule is needed.

**`windowDays = null` ("all"):** no prior window to compare against, so the
engine skips classification — every row is `bucket: 'new'` with `windowCount` =
all-time logs and `baselineRate = 0`. The UI degrades gracefully (see below).

### 2. Rewire `NeedsAttention` — `apps/web/src/components/v3/needs-attention.tsx`

The **act-now** panel. Consumes the engine's **down** side only.

- Take the selected `windowDays` as a prop (Dashboard passes the toggle value).
- Fetch the team's non-hidden `activity_logs` deep enough to cover the baseline
  (`(BASELINE_WINDOWS + 1) × windowDays`), client-side via `useSupabase`
  (RLS-scoped) → feed `computeEngagement`.
- **Keep** the `low` readiness flag (trim the existing `twilio_messages` fetch
  to just the latest survey reply per player).
- Show: **low readiness** + **quiet** only. Priority: low (red) → quiet (amber).
  Row gains the supporting number: `"last logged {relativeTime(lastActive)}"` /
  `"no logs"` / `"readiness {n}"`. Sort by severity; top 8 (unchanged).
- **"all" window:** falls back to readiness-only (no baseline to call "quiet").

Props change (`teamId` → `teamId` + `windowDays`); placement and shape unchanged.

### 3. Swap "Recent activity" teaser → **Movers** card — `apps/web/src/app/dashboard/page.tsx` (+ new `apps/web/src/components/v3/movers-card.tsx`)

The **trend** view — the direct answer to "who's doing more or less over the
past X days." Consumes the engine's signed `delta`, same fetch/window.

- Two compact columns: **↑ Heating up** (top risers by `delta`) and
  **↓ Cooling off** (top fallers; `cooling` bucket, `windowCount > 0` — fully
  silent regulars live in NeedsAttention, so the two cards partition cleanly).
- Each row: name, group, and the move — e.g. `"2 → 6 ↑"` / `"5 → 2 ↓"`
  (baseline-rounded → windowCount), deep-link to the athlete page.
- Top ~4 per side. Empty side shows a quiet em-dash.
- **"all" window:** the card becomes "Most active overall" — a single ranked
  list by all-time `windowCount` (no ↑/↓, since there's no baseline).
- Replaces the old `recentActivity` state, its fetch, and the teaser markup in
  `page.tsx`.

### 4. Retire the competition volume strip — `apps/web/src/app/dashboard/competitions/page.tsx`

- Remove the 4-cell volume strip (last-30d) and the `volume` state + its
  `activity_logs` fetch.
- Replace with a single quiet line near the top: **"Team pulse →"**
  linking to `/dashboard` — removing a duplicate widget *and* redirecting the
  behavior that triggered the original question.

## Data flow

```
                    PeriodToggle (windowDays) ─────────────┐
                                                           ▼
activity_logs (covers window + 4 prior windows) ─► computeEngagement(windowDays) ─► EngagementRow[]
players (active, group-scoped) ─────────────────┘            │
                                              ┌──────────────┴──────────────┐
twilio_messages (survey, latest) ─► readiness │ down (quiet/low)            │ signed delta (↑/↓)
                                              ▼                              ▼
                                       NeedsAttention                    Movers card
```

All reads are client-side through `useSupabase`, RLS-scoped to the team. No new
API route, no server code. Respects `prefs.group_filter` (scope roster + logs).

## Edge cases

- **No logs at all in range:** `baselineRate = 0`, `windowCount = 0` → `new` →
  not flagged, not a mover.
- **Brand-new athlete:** near-zero baseline `< REGULAR_FLOOR` → `new` (unless
  they're already logging enough to read as `heating`).
- **`player_id` null on a log:** ignored.
- **Hidden logs:** excluded at query time (`hidden = false`).
- **Group filter:** respect `prefs.group_filter` (scope roster + logs).
- **`windowDays = 1`:** baseline = prior 4 days; noisier but consistent; the
  `MIN_ACTIVE` floor keeps single-log blips out of "heating."
- **Severity ties:** stable sort; secondary key = `delta` then name.

## Testing

- `apps/web/src/lib/engagement.test.ts` (new) — pure unit tests for
  `computeEngagement`, following `timeline.test.ts`. `now` and `windowDays`
  injected for determinism. Cover, at `windowDays = 7` and at least one other
  window:
  - regular who went silent → `quiet`
  - regular who halved → `cooling`
  - regular ramping up → `heating`
  - previously-inactive athlete now logging → `heating` (via `max(baseline,1)`)
  - steady regular → `steady` (not flagged, not a mover)
  - never-engaged / brand-new → `new`
  - boundaries: baseline exactly `REGULAR_FLOOR`; ratio exactly `COOLING_RATIO`;
    `windowCount` exactly `MIN_ACTIVE`
  - `windowDays = null` → all rows `new`, `windowCount` = all-time
- Definition of done (CLAUDE.md): `bun run typecheck`, `bun run lint`,
  `bun run build:web` all green before commit.

## Out of scope / future

- Outbound "nudge this athlete" action (panels surface; coach acts).
- Reusing `computeEngagement` to add a window/baseline column to the roster page
  (`/dashboard/players`) — cheap later because the engine is pure.
- Realtime auto-refresh.
- Per-kind momentum (e.g. "swimming up, lifting down") — v1 counts all kinds
  together.
