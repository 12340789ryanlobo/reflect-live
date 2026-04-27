# Phase 1 — Fitness Scoring + Leaderboard

**Date:** 2026-04-22
**Status:** Pending user approval
**Author:** Ryan Lobo (with Claude Code)
**Parent spec:** `2026-04-22-reflect-live-v3-design.md` §4

---

## 1. Goal

Port reflect's fitness-scoring leaderboard into reflect-live. Coaches and admins can see who's putting work in. Athletes see their own ranking. The point values per activity (workout / rehab) are configurable per team.

Self-contained phase: no Twilio outbound, no LLM, no schema-heavy migrations beyond a single column add.

## 2. Scoring source-of-truth

The leaderboard counts **inbound `twilio_messages` where `category IN ('workout', 'rehab')`** for the relevant time window. This is the live SMS stream — what athletes have actually texted in.

`activity_logs` is **not** used for scoring. It exists only as the historical import from reflect's prod DB and powers the Activity page's audit table. The deeper sync fix (have the worker upsert into `activity_logs` when it categorizes a message) is tracked as the deferred data-sync audit task — not in Phase 1's scope.

This means: a brand-new team starts with zero leaderboard data and grows as athletes text in. The historical activity table on the Activity page can show populated data immediately if seeded; the leaderboard reflects only the live stream.

## 3. Schema change (one column)

```sql
-- supabase/migrations/0004_team_scoring_config.sql
ALTER TABLE teams
  ADD COLUMN scoring_json jsonb
    NOT NULL
    DEFAULT '{"workout_score": 1.0, "rehab_score": 0.5}'::jsonb;
```

Defaults match reflect. Existing teams get the defaults applied via the `DEFAULT` clause. The column is `NOT NULL` so we never have to handle null.

**RLS:** existing `teams` row policy applies — coach/admin of the team can SELECT and UPDATE their own team. No new policy needed; if Postgres complains, we add one mirroring the team-id-from-jwt pattern used elsewhere.

## 4. Scoring computation

A single helper function in `apps/web/src/lib/scoring.ts`:

```ts
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

/**
 * Compute leaderboard from twilio_messages.
 *
 * @param sb         supabase client
 * @param teamId     team to score
 * @param scoring    point values
 * @param sinceISO   optional lower bound on date_sent (omit for all-time)
 */
export async function computeLeaderboard(
  sb: SupabaseClient,
  teamId: number,
  scoring: TeamScoring,
  sinceISO?: string,
): Promise<LeaderboardRow[]>;
```

Implementation:

1. Fetch all active players for the team (`players` where `team_id = ? AND active = true`).
2. Fetch `twilio_messages` where:
   - `team_id = ?`
   - `direction = 'inbound'`
   - `category IN ('workout', 'rehab')`
   - `player_id IS NOT NULL`
   - `date_sent >= ?` if `sinceISO` provided
3. Aggregate counts in JS: `Map<player_id, { workouts: number, rehabs: number }>`.
4. For each player with > 0 entries, build `LeaderboardRow` with `points = workouts × workout_score + rehabs × rehab_score`.
5. Sort: `points DESC`, then `workouts DESC`, then `rehabs DESC`, then `name ASC`.
6. Return.

Edge cases:
- A message tagged `workout` but with `player_id = null` (no roster match) is excluded from scoring. It still appears in the message stream, just not the leaderboard.
- A player with zero contributing messages is excluded from the leaderboard (matches reflect — empty state lives in the UI).

## 5. Weekly window

The "This week" leaderboard uses Monday 00:00 Central Time as the floor. Helper:

```ts
// apps/web/src/lib/scoring.ts
export function weekStartCT(): Date {
  const now = new Date();
  // Convert "now" to Central Time wall-clock components, then back to UTC instant
  // for the most-recent Monday 00:00 CT.
  // Using Intl.DateTimeFormat with timeZone: 'America/Chicago'
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const ctNow = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-06:00`);
  // ^ -06:00 is CST/CDT-ish; Date arithmetic that follows works in UTC anyway, only need ordinal.
  const day = ctNow.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const daysSinceMonday = (day + 6) % 7;
  const mondayCT = new Date(ctNow);
  mondayCT.setUTCDate(ctNow.getUTCDate() - daysSinceMonday);
  mondayCT.setUTCHours(0, 0, 0, 0);
  // Convert back: Monday 00:00 CT == 06:00 UTC (CST) or 05:00 UTC (CDT)
  // Simplest: compute the offset for that Monday.
  const offsetMs = ctNow.getTime() - now.getTime();
  return new Date(mondayCT.getTime() - offsetMs);
}
```

Note: timezone math is famously a foot-gun. We accept that DST transition weeks are off by an hour and move on. If it ever matters, swap to a `date-fns-tz` helper. For now no new dep.

## 6. UI

### 6.1 Activity page — leaderboard cards

Add two cards above the existing "Past activity" table on `apps/web/src/app/dashboard/fitness/page.tsx`:

```
┌──────────────────────────┐  ┌──────────────────────────┐
│ This week                │  │ All time                 │
│ ───────────────────────  │  │ ───────────────────────  │
│ 1. Maya Lin       42 pt  │  │ 1. Maya Lin      387 pt  │
│ 2. Arjun Patel    38 pt  │  │ 2. Kofi Okafor   341 pt  │
│ ...                      │  │ ...                      │
└──────────────────────────┘  └──────────────────────────┘
```

Each row: `<rank>. <name>     <points>` plus group + raw counts as a smaller second line. New v3 component `apps/web/src/components/v3/leaderboard.tsx`:

```tsx
export function Leaderboard({
  title,
  rows,
  highlightPlayerId,
}: {
  title: string;
  rows: LeaderboardRow[];
  highlightPlayerId?: number;
});
```

Visual:
- Card chrome matches Phase 0 — `rounded-2xl bg-card border` with header.
- Top 3 get larger rank numbers in the v3 blue color.
- Rows are clickable links to `/dashboard/player/[id]`.
- Empty state: "— no points yet — text the team line to start logging."
- Optional `highlightPlayerId` highlights "you" on the athlete view.

Layout on the Activity page: a 2-column row above the Past activity table. Stacks to single column on mobile.

### 6.2 Athlete view — your rank

On `apps/web/src/app/dashboard/athlete/page.tsx`, when a user is impersonating an athlete, add a small "Your rank" line to the existing My-stats strip OR a dedicated row showing both leaderboards with the user highlighted. Decision: add a single rank chip — `Your rank: #4 this week · #2 all-time` — on the my-view page. Simpler than rendering full leaderboards on a personal page.

### 6.3 Settings — Scoring card (coach + admin only)

New section on `apps/web/src/app/dashboard/settings/page.tsx`, between the existing Role and Phone-OTP cards. Visible only when `currentRole === 'coach' || 'admin'` (not for captain or athlete).

```
┌──────────────────────────────────────┐
│ Scoring                              │
│ Points awarded per logged activity.  │
│                                      │
│ Workout       [   1.0   ] points     │
│ Rehab         [   0.5   ] points     │
│                                      │
│ [ Save scoring ]                     │
└──────────────────────────────────────┘
```

- Two number inputs, step `0.5`, min `0`, max `100`.
- "Save scoring" button. On click: PATCH `/api/team/scoring`. Show inline status ("Saved" or error).
- After save: Activity page leaderboards reflect new scoring on next load.
- The values come from `useDashboard()` context's `team.scoring_json` (which we add to the dashboard-shell's data fetch).

### 6.4 Role switcher UX fix (small adjacent fix)

The current Role / view tile group on Settings: clicking a tile only updates React state; you have to scroll to find "Save preferences" and click it. Confusing — feels like the click did nothing.

Fix: clicking a role tile **immediately saves** to `/api/preferences` (drop the separate Save button for the role section; preferences elsewhere — group filter, watchlist if any — keep their own Save button), shows an inline confirmation `Switched to Coach view · refreshing…`, and triggers a router refresh so the dashboard shell re-routes per the new role.

Concretely in code: when a tile is clicked, call a `setRoleAndSave(opt.value)` function that updates state, POSTs preferences, calls `refreshShell()`, and sets a status string. Clear the status after 2 seconds.

If the user switches to athlete role and hasn't yet picked which player to impersonate, route them to `/dashboard/settings` (not `/dashboard/athlete`) so they can complete that selection — actually the existing role-routing logic handles this. Just keep it.

## 7. API surface

One new server route:

`apps/web/src/app/api/team/scoring/route.ts`

- `PATCH` — accepts `{ workout_score: number, rehab_score: number }`. Validates both are non-negative numbers ≤ 100. Calls Supabase to update the user's team's `scoring_json`. Returns the new config. RLS on `teams` enforces that the caller can only update their own team.
- `GET` — optional, returns the current config. Probably not needed since we hydrate from `useDashboard()`.

The leaderboard data is computed client-side from `twilio_messages` — no API route needed for it. Each Activity page render triggers two `computeLeaderboard()` calls (one all-time, one weekly). Performance: a team has < 500 inbound workout/rehab messages in any reasonable window; client-side aggregation is cheap.

For larger teams down the line, we can swap in a Postgres SQL view. Not Phase 1.

## 8. dashboard-shell context — add scoring_json

The `useDashboard()` hook currently exposes `{ prefs, team, role, refresh }`. The `team` value is already fetched from the `teams` table; once the migration adds `scoring_json` to the row shape (TS type extension), `team.scoring_json` is available everywhere automatically.

Update `packages/shared/src/types.ts` (or wherever `Team` is defined) to include `scoring_json: { workout_score: number; rehab_score: number }`.

## 9. Files affected

**Create:**
- `supabase/migrations/0004_team_scoring_config.sql`
- `apps/web/src/lib/scoring.ts`
- `apps/web/src/components/v3/leaderboard.tsx`
- `apps/web/src/app/api/team/scoring/route.ts`

**Modify:**
- `packages/shared/src/types.ts` — extend `Team` with `scoring_json`
- `apps/web/src/app/dashboard/fitness/page.tsx` — add the two leaderboard cards above the Past activity table
- `apps/web/src/app/dashboard/athlete/page.tsx` — add "Your rank" chip
- `apps/web/src/app/dashboard/settings/page.tsx` — add Scoring card (coach + admin), fix role-switcher UX

**Untouched:**
- All other dashboard pages, the worker, the v3 primitives, all other components.

Net: ~7 file touches, one schema migration, no UI primitives invented (only one new domain component, `Leaderboard`).

## 10. Tests

For Phase 1 we add light test coverage on the pure logic:

- `apps/web/tests/lib/scoring.test.ts` (Vitest, plain unit tests):
  - `computeLeaderboard` correctness with mock supabase client (small fixtures of players + messages).
  - Tiebreaker ordering: same points → more workouts wins; same workouts → more rehabs wins; same again → alphabetical.
  - Empty input → empty array.
  - `weekStartCT()` returns a Monday-00:00-ish CT instant (fuzzy assertion: `getUTCDay()` returns 1 in CT-equivalent).

No UI-level tests in Phase 1. Build + visual verify the leaderboard cards on the running app.

`apps/web` does not currently have a test setup (`apps/worker` uses Bun's built-in test runner). The implementation plan adds Vitest as a dev dep + minimal `vitest.config.ts` as its first task so subsequent tasks can write tests against it. Net new dep is acceptable — scoring logic is pure enough that "verify by running the app" is not enough.

## 11. Out of scope (deferred)

- Per-athlete score history charts.
- Achievements, streaks, badges.
- Personal-best detection ("you set a new high this week").
- Realtime push when a new workout message arrives — leaderboard recomputes only on page load. Adding live updates is small but explicitly Phase 1+ work.
- Worker-side dual-write to `activity_logs` to unify the two stores. That's the deferred data-sync audit task.
- Coach-customizable point definitions beyond `workout_score` and `rehab_score` — e.g., per-description multipliers like "long workout × 1.5" (per IDEAS.md). Future phase if needed.
- Admin → Teams → Edit dialog gaining a scoring section. Coach + admin can edit via Settings; superadmin bulk-edit isn't needed yet.

## 12. Open questions

None blocking. Possible future considerations:

1. **Year-round vs season-based "all time"** — should "all-time" reset annually, or be true cumulative? Phase 1 = true cumulative. Easy to add a season filter later if asked.
2. **Hide leaderboard from athlete view entirely?** Currently athletes see the leaderboards on Activity page (since they have access to that page). User feedback during use will tell us if that creates pressure we don't want.

## 13. Approval gate

When the user is satisfied with this spec, next step is `writing-plans` skill to turn it into a file-by-file implementation plan with bite-sized tasks. No app code changes until that plan exists and is itself reviewed.
