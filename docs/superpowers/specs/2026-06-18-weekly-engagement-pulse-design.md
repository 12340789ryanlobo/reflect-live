# Weekly Engagement Pulse — design

**Date:** 2026-06-18 · **Status:** approved, ready for plan

## Where this came from

A coach (client), while looking at the **competition pages**, asked: *"Is there
any way to look at team workouts over the last 7 days?"*

The literal ask is trivial — `activity_logs` is already queryable by date. The
real question is **why a coach was on the standings page asking for a 7-day
activity slice**. The diagnosis:

- A competition leaderboard is a **cumulative scoreboard** over the whole
  `starts_at → ends_at` window. Weeks in, it freezes — early leaders stay on
  top and it stops answering *"who's actually training right now, and who's
  gone quiet?"* Cumulative totals reward early accumulation and hide recent
  drop-off.
- The coach was using the leaderboard as a **stand-in for an engagement view**
  because it was the closest thing the app had. (Confirmed with the product
  owner: the intent is managing athletes, not running the game.)

So the root problem is: **the app has no good answer to "who do I need to nudge
this week."** The competition page is just where the coach hit that wall.

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

So the panel meant to answer "who's slipping" doesn't, and the coach goes
hunting on the competition page. **We fix the panel, not add a new one.**

## Goals

- Replace the crude "quiet = silent 24h" signal with a **training drop-off
  signal relative to each athlete's own baseline**, computed from
  `activity_logs`.
- Surface, on the Dashboard the coach already lands on, **who has slipped or
  gone quiet this week** — sorted by severity, with the actual numbers.
- **Reduce surfaces, not add them.** Net change: one panel gets smarter, one
  redundant widget is retired, one breadcrumb is added.

## Non-goals (YAGNI)

- No new page, no new nav item, no new API route.
- No nudge/messaging action in v1 (the panel deep-links to the athlete page;
  the coach acts manually). Outbound nudging is a possible follow-on.
- No Realtime subscription in v1 — this is a weekly view; a one-shot fetch on
  mount (matching the current `NeedsAttention` behavior) is sufficient.
- No reuse on the roster page yet — the engine is built reusable so that's
  cheap later, but it's out of scope here.

## Locked decisions

| Decision | Value |
|----------|-------|
| Attention signal | Drop-off vs. athlete's **own** baseline (not absolute, not coach-target) |
| Baseline window | Trailing **4 weeks** = days 8–35 before now; `baselineWeekly = count / 4` |
| "Regular" floor | `baselineWeekly ≥ 2` logs/week (below this, athlete was never consistently engaged) |
| "Slipping" threshold | `thisWeek ≤ baselineWeekly × 0.5` (dropped by half or more), and `thisWeek > 0` |
| "Quiet" | Regular (baseline ≥ 2) **and** `thisWeek === 0` |
| What counts as activity | **All** `activity_logs` kinds (workout, rehab, swim, lift, …) — engagement = "showing up at all," not workouts only |
| Volume strip on competition page | **Retired**, replaced by a "This week's pulse →" breadcrumb |

## Architecture

Three pieces, all inside `apps/web`. No schema change, no migration.

### 1. Engagement engine — `apps/web/src/lib/engagement.ts` (new, pure)

A pure function (no I/O) so it's unit-testable in isolation, matching the
`scoring.ts` / `timeline.ts` pattern.

```ts
// Shapes are illustrative; match existing @reflect-live/shared types.
interface EngagementInput {
  players: Array<{ id: number; name: string; group: string | null }>;
  logs: Array<{ player_id: number | null; logged_at: string }>; // non-hidden, last 35d
  now: number; // ms epoch, injected for testability
}

type Bucket = 'quiet' | 'slipping' | 'steady' | 'surging' | 'new';

interface EngagementRow {
  player_id: number;
  thisWeek: number;        // logs in last 7 days
  baselineWeekly: number;  // trailing 4-week avg (days 8–35)
  lastActive: string | null; // ISO of most recent log, or null
  bucket: Bucket;
  severity: number;        // higher = more urgent; for sorting
}

function computeEngagement(input: EngagementInput): EngagementRow[];
```

Constants live at the top of the file so they're tunable in one place:

```ts
const WEEK_MS = 7 * 24 * 3600 * 1000;
const BASELINE_WEEKS = 4;          // days 8–35
const REGULAR_FLOOR = 2;           // baselineWeekly ≥ this to be "a regular"
const SLIPPING_RATIO = 0.5;        // thisWeek ≤ baseline × this → slipping
const SURGING_RATIO = 1.5;         // thisWeek ≥ baseline × this → surging
```

The "regular floor" is the single gate for *"do we have enough signal to call a
drop?"* — a brand-new athlete or a never-engaged one both land below it
naturally (their baseline is ~0), so no separate "new athlete" rule is needed.

**Bucket logic (per athlete):**

1. `thisWeek` = logs with `logged_at` within `[now − 7d, now]`.
2. `baselineLogs` = logs within `[now − 35d, now − 7d]`; `baselineWeekly =
   baselineLogs / BASELINE_WEEKS`.
3. If `baselineWeekly < REGULAR_FLOOR` → bucket `new` (covers never-engaged
   **and** brand-new athletes — both have a near-zero baseline); **not
   flagged**. (They didn't drop, so we don't cry wolf. They'll surface
   elsewhere as low-engagement, not as "needs attention.")
4. Else if `thisWeek === 0` → **`quiet`**. Severity scales with how long
   they've been silent and how high their baseline was.
5. Else if `thisWeek ≤ baselineWeekly × SLIPPING_RATIO` → **`slipping`**.
   Severity scales with the size of the drop.
6. Else if `thisWeek ≥ baselineWeekly × SURGING_RATIO` → **`surging`** (not
   flagged; available for a future positive callout).
7. Else → **`steady`** (not flagged).

Only `quiet` and `slipping` rows are "needs attention"; the component filters
to those (plus `low` readiness, below).

### 2. Rewire `NeedsAttention` — `apps/web/src/components/v3/needs-attention.tsx`

- Replace the `twilio_messages`-based 24h-silence logic with: fetch the team's
  non-hidden `activity_logs` for the **last 35 days** (client-side via
  `useSupabase`, RLS-scoped, same as today's fetch) → feed `computeEngagement`.
- **Keep** the `low` readiness flag. Trim the existing `twilio_messages` fetch
  to just what readiness needs (latest survey reply per player, last 7d).
- **Merge + priority** when an athlete trips more than one reason — show one
  dominant pill, highest-severity first:
  1. `low` readiness (red) — acute wellness, highest priority
  2. `quiet` (red/amber)
  3. `slipping` (amber)
- **Row content:** initials + name + group (unchanged) + a reason pill + the
  supporting number:
  - slipping → `"3→1 this wk"` (baseline-rounded → thisWeek)
  - quiet → `"last logged {relativeTime(lastActive)}"` or `"no logs"`
  - low → `"readiness {n}"` (unchanged)
- Sort by severity; show top 8 (unchanged). Empty state unchanged.

This keeps the component's shape, props (`teamId`), and placement identical —
only the signal improves.

### 3. Retire the competition volume strip — `apps/web/src/app/dashboard/competitions/page.tsx`

- Remove the 4-cell volume strip (`Workouts / Rehabs / Active loggers / Avg per
  athlete`, last 30d) and the `volume` state + its `activity_logs` fetch.
- Replace with a single quiet line near the top: **"This week's pulse →"**
  linking to `/dashboard`. This both removes a duplicate volume widget and
  redirects the exact behavior (coach using competitions as an activity view)
  that triggered the original question.

## Data flow

```
activity_logs (last 35d, RLS-scoped) ─┐
                                      ├─► computeEngagement() ─► EngagementRow[] ─┐
players (active) ─────────────────────┘                                          ├─► NeedsAttention panel
twilio_messages (survey, last 7d) ───────────► latest readiness per player ──────┘     (Dashboard)
```

All reads are client-side through `useSupabase`, RLS-scoped to the team — no new
API route, no server code.

## Edge cases

- **Athlete with no logs at all in 35d:** `baselineWeekly = 0 < REGULAR_FLOOR` →
  bucket `new`/never-engaged → not flagged. (Avoids flagging the whole bench.)
- **Brand-new athlete (joined this week):** near-zero baseline `< REGULAR_FLOOR`
  → `new` → not flagged.
- **`player_id` null on a log:** ignored (can't attribute).
- **Hidden logs:** excluded at query time (`hidden = false`).
- **Group filter:** respect `prefs.group_filter` if set, consistent with the
  rest of the Dashboard (scope roster + logs to the group).
- **Severity ties:** stable sort; secondary key = `thisWeek` ascending (quieter
  first).

## Testing

- `apps/web/src/lib/engagement.test.ts` (new) — pure unit tests for
  `computeEngagement`, following `timeline.test.ts`. Cover: a regular who went
  quiet → `quiet`; a regular who halved → `slipping`; steady → not flagged;
  surging → `surging`; never-engaged → `new`; brand-new athlete → `new`;
  baseline boundary at exactly `REGULAR_FLOOR`; slipping boundary at exactly
  `× 0.5`. `now` is injected so tests are deterministic.
- Definition of done (from CLAUDE.md): `bun run typecheck`, `bun run lint`,
  `bun run build:web` all green before commit.

## Out of scope / future

- Outbound "nudge this athlete" action (the panel only surfaces; coach acts).
- Reusing `computeEngagement` to add a 7-day / baseline column to the roster
  page (`/dashboard/players`) — cheap later because the engine is pure.
- Realtime auto-refresh of the panel.
- A positive "surging / on a streak" callout (the `surging` bucket is computed
  but unused in v1).
