# Phase 1 — Fitness Scoring + Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add team-configurable fitness scoring (points per workout / rehab) and weekly + all-time leaderboards on the Activity page, plus a personal rank chip on the athlete view, plus a small role-switcher UX fix on Settings.

**Architecture:** One DB column (`teams.scoring_json`) holds per-team point values. A pure aggregation helper (`scoring.ts`) computes leaderboards from inbound `twilio_messages` tagged `workout`/`rehab`. A `Leaderboard` v3 component renders rows. A PATCH API route writes the scoring config.

**Tech Stack:** Next.js 16 · Supabase (Postgres) · Bun's built-in test runner (matches existing `apps/worker` pattern; spec mentioned Vitest but Bun's runner is already wired up project-wide and saves a dep).

**Verification model:** Pure logic in `apps/web/src/lib/scoring.ts` is TDD — tests written first against `bun test`. UI changes verified by `bun run build` + visual check on Vercel preview after push.

**Spec:** `docs/superpowers/specs/2026-04-22-reflect-live-phase-1-fitness-scoring.md`

---

## File structure

**Create:**
- `supabase/migrations/0009_team_scoring_config.sql` — adds the column
- `apps/web/src/lib/scoring.ts` — types, `aggregateLeaderboard` (pure), `computeLeaderboard` (fetch + aggregate), `weekStartCT`
- `apps/web/tests/lib/scoring.test.ts` — bun:test cases against the pure aggregation
- `apps/web/src/components/v3/leaderboard.tsx` — visual component
- `apps/web/src/app/api/team/scoring/route.ts` — PATCH endpoint

**Modify:**
- `packages/shared/src/types.ts` — extend `Team` with `scoring_json`
- `apps/web/package.json` — add `"test": "bun test"` script if not present
- `apps/web/src/app/dashboard/fitness/page.tsx` — embed two leaderboard cards above Past activity
- `apps/web/src/app/dashboard/athlete/page.tsx` — add personal-rank chip on selected-athlete view
- `apps/web/src/app/dashboard/settings/page.tsx` — add Scoring card (coach + admin), refactor role tiles to click-to-save with inline confirmation

**Untouched:** worker, all other dashboard pages, existing v3 primitives, existing migrations.

---

## Task 1 — DB migration: `teams.scoring_json`

**Files:**
- Create: `supabase/migrations/0009_team_scoring_config.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0009_team_scoring_config.sql
--
-- Phase 1 — fitness scoring + leaderboard.
-- Adds per-team configurable point values for workouts and rehabs.
-- Defaults match the historical reflect implementation: workout=1.0, rehab=0.5.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS scoring_json jsonb
    NOT NULL
    DEFAULT '{"workout_score": 1.0, "rehab_score": 0.5}'::jsonb;

COMMENT ON COLUMN teams.scoring_json IS
  'Phase 1: per-team scoring config. Shape: {"workout_score": number, "rehab_score": number}.';
```

- [ ] **Step 2: Apply via Supabase MCP**

The reflect-live README's setup section says migrations apply via the Supabase MCP / dashboard SQL editor. Apply this migration to the project's Postgres. Locally you can run it via `psql` if you have a connection; in production it'll be applied via the Supabase web UI when pushed.

Run via Supabase MCP if available:
```
mcp__supabase__apply_migration --name 0009_team_scoring_config --query "<contents of file>"
```

If MCP isn't connected to the project right now, the migration file is on disk and can be applied later. The plan continues either way — the Postgres column needs to exist before the API route or page queries hit it, but you can ship code first and apply migration separately.

- [ ] **Step 3: Commit**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live"
git add supabase/migrations/0009_team_scoring_config.sql
git commit -m "phase-1: migration — teams.scoring_json (workout/rehab points)"
```

---

## Task 2 — Type extension: `Team.scoring_json`

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Read the current Team type**

```bash
cat "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/packages/shared/src/types.ts" | grep -A 15 "interface Team"
```

You'll see the current `Team` interface. Note its location and existing fields.

- [ ] **Step 2: Add `scoring_json` to the Team interface**

Use the Edit tool. Find the existing `Team` interface and add a new field. The exact form:

```ts
export interface TeamScoring {
  workout_score: number;
  rehab_score: number;
}

export interface Team {
  // ... existing fields unchanged
  scoring_json: TeamScoring;
}
```

If `Team` already imports from elsewhere, just add the new field at the end of the interface. Add `TeamScoring` as a sibling export (above or below `Team`).

- [ ] **Step 3: Verify the build still compiles**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`. The new field is non-breaking — existing code that reads other Team fields continues to work, and code that doesn't touch scoring_json is unaffected.

- [ ] **Step 4: Commit**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live"
git add packages/shared/src/types.ts
git commit -m "phase-1: extend Team type with scoring_json"
```

---

## Task 3 — Wire up `bun test` for `apps/web`

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Read current package.json**

```bash
cat "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web/package.json"
```

Note the existing `scripts` section.

- [ ] **Step 2: Add a `"test"` script**

Use Edit. Add `"test": "bun test"` to the scripts object. The result should look like:

```json
{
  ...
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "bun test"
  },
  ...
}
```

If any of the listed scripts already exist, only add the missing `"test"` entry — don't reorder or rename existing ones. Don't add devDependencies (Bun's test runner is built in).

- [ ] **Step 3: Verify the script is present**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
grep -A 1 '"test"' package.json
```

Expected output includes `"test": "bun test"`.

- [ ] **Step 4: Don't commit yet** — bundles with Task 4's first test commit so the diff includes both the script and a real test that exercises it.

---

## Task 4 — Scoring lib: types + pure aggregation + tests

**Files:**
- Create: `apps/web/src/lib/scoring.ts`
- Create: `apps/web/tests/lib/scoring.test.ts`

We'll TDD this: test first, see it fail (because the file doesn't exist), implement, see it pass.

- [ ] **Step 1: Create the test file with failing tests**

```bash
mkdir -p "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web/tests/lib"
```

Write `apps/web/tests/lib/scoring.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  aggregateLeaderboard,
  weekStartCT,
  type LeaderboardInputMessage,
  type LeaderboardInputPlayer,
  type TeamScoring,
} from '@/lib/scoring';

const SCORING: TeamScoring = { workout_score: 1.0, rehab_score: 0.5 };

const PLAYERS: LeaderboardInputPlayer[] = [
  { id: 1, name: 'Alice Anderson', group: null },
  { id: 2, name: 'Bob Brown', group: 'sprint' },
  { id: 3, name: 'Cam Chen', group: 'distance' },
];

describe('aggregateLeaderboard', () => {
  test('empty input returns empty array', () => {
    const result = aggregateLeaderboard([], [], SCORING);
    expect(result).toEqual([]);
  });

  test('only includes players with at least one contributing message', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      player_id: 1,
      name: 'Alice Anderson',
      group: null,
      workouts: 1,
      rehabs: 0,
      points: 1,
    });
  });

  test('counts workouts and rehabs separately and computes points', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 1, category: 'workout' },
      { player_id: 1, category: 'rehab' },
      { player_id: 2, category: 'workout' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    // Alice: 2 workouts × 1.0 + 1 rehab × 0.5 = 2.5
    // Bob: 1 workout × 1.0 = 1.0
    expect(result).toEqual([
      { player_id: 1, name: 'Alice Anderson', group: null, workouts: 2, rehabs: 1, points: 2.5 },
      { player_id: 2, name: 'Bob Brown', group: 'sprint', workouts: 1, rehabs: 0, points: 1.0 },
    ]);
  });

  test('ignores survey and chat categories', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'survey' },
      { player_id: 1, category: 'chat' },
      { player_id: 2, category: 'workout' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    expect(result).toHaveLength(1);
    expect(result[0].player_id).toBe(2);
  });

  test('tiebreaker: equal points → more workouts wins', () => {
    // Alice: 1 workout = 1pt. Bob: 2 rehabs = 1pt. Alice has more workouts.
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 2, category: 'rehab' },
      { player_id: 2, category: 'rehab' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    expect(result.map((r) => r.player_id)).toEqual([1, 2]);
  });

  test('tiebreaker: equal points and workouts → more rehabs wins', () => {
    // Alice: 1 workout + 0 rehab = 1pt. Bob: 1 workout + 0 rehab = 1pt. Cam: 1 workout + 1 rehab = 1.5pt.
    // Add a case where Alice and Bob both have 1 workout but Bob has 1 rehab too.
    const scoring: TeamScoring = { workout_score: 1.0, rehab_score: 0.0 }; // make rehab worth 0 to force tie
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 2, category: 'workout' },
      { player_id: 2, category: 'rehab' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, scoring);
    // Alice: 1w 0r 1pt. Bob: 1w 1r 1pt. Same points, same workouts, Bob wins on rehabs.
    expect(result.map((r) => r.player_id)).toEqual([2, 1]);
  });

  test('tiebreaker: identical counts → alphabetical by name', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 2, category: 'workout' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    // Alice and Bob both have 1 workout, 0 rehab, 1pt. Alice < Bob alphabetically.
    expect(result.map((r) => r.player_id)).toEqual([1, 2]);
  });

  test('messages with player_id not in players list are ignored', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 999, category: 'workout' }, // unknown player
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    expect(result).toHaveLength(1);
    expect(result[0].player_id).toBe(1);
  });

  test('respects custom scoring values', () => {
    const scoring: TeamScoring = { workout_score: 5.0, rehab_score: 2.5 };
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 1, category: 'rehab' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, scoring);
    expect(result[0].points).toBe(7.5);
  });
});

describe('weekStartCT', () => {
  test('returns a Date instance', () => {
    expect(weekStartCT()).toBeInstanceOf(Date);
  });

  test('returns a Monday in Central Time', () => {
    const ws = weekStartCT();
    // Format the returned UTC instant in America/Chicago and check the weekday.
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
    });
    expect(fmt.format(ws)).toBe('Mon');
  });

  test('returns midnight (00:00) Central Time', () => {
    const ws = weekStartCT();
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const formatted = fmt.format(ws);
    // formatter renders something like "00:00"; allow either "00:00" or "0:00"
    expect(formatted.replace(/^(\d):/, '0$1:')).toBe('00:00');
  });

  test('is in the past or present, not future', () => {
    const ws = weekStartCT();
    expect(ws.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('is within the last 7 days', () => {
    const ws = weekStartCT();
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    expect(ws.getTime()).toBeGreaterThanOrEqual(sevenDaysAgo);
  });
});
```

- [ ] **Step 2: Run the tests — expect them to fail because `scoring.ts` doesn't exist yet**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun test 2>&1 | tail -20
```

Expected: an import error or "module not found" error pointing at `@/lib/scoring`. If the tests run and pass without the source file existing, something is wrong — STOP.

- [ ] **Step 3: Create `apps/web/src/lib/scoring.ts` with the full implementation**

Write the file:

```ts
// apps/web/src/lib/scoring.ts
//
// Phase 1 — fitness scoring helpers.
// Pure aggregation lives in `aggregateLeaderboard`; the supabase-aware fetch
// is `computeLeaderboard`. Tests target the pure function directly.

import type { SupabaseClient } from '@supabase/supabase-js';

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

export interface LeaderboardInputMessage {
  player_id: number;
  category: 'workout' | 'rehab' | 'survey' | 'chat';
}

/**
 * Pure aggregation. Given the active roster and a list of inbound messages
 * (already filtered to category workout/rehab), compute the leaderboard.
 *
 * Sort: points DESC → workouts DESC → rehabs DESC → name ASC.
 * Players with zero contributing messages are excluded.
 */
export function aggregateLeaderboard(
  players: LeaderboardInputPlayer[],
  messages: LeaderboardInputMessage[],
  scoring: TeamScoring,
): LeaderboardRow[] {
  const counts = new Map<number, { workouts: number; rehabs: number }>();
  for (const m of messages) {
    if (m.category !== 'workout' && m.category !== 'rehab') continue;
    const existing = counts.get(m.player_id) ?? { workouts: 0, rehabs: 0 };
    if (m.category === 'workout') existing.workouts += 1;
    else existing.rehabs += 1;
    counts.set(m.player_id, existing);
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
 * Fetch + aggregate. Used by Activity page render.
 *
 * @param sb        supabase client
 * @param teamId    team to score
 * @param scoring   point values
 * @param sinceISO  optional lower bound on date_sent (omit for all-time)
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
    .from('twilio_messages')
    .select('player_id,category')
    .eq('team_id', teamId)
    .eq('direction', 'inbound')
    .in('category', ['workout', 'rehab'])
    .not('player_id', 'is', null);

  if (sinceISO) q = q.gte('date_sent', sinceISO);

  const { data: msgsData } = await q;
  const messages: LeaderboardInputMessage[] = ((msgsData ?? []) as Array<{
    player_id: number;
    category: string;
  }>).map((m) => ({
    player_id: m.player_id,
    category: m.category as LeaderboardInputMessage['category'],
  }));

  return aggregateLeaderboard(players, messages, scoring);
}

/**
 * The instant of the most recent Monday 00:00 in America/Chicago, expressed
 * as a UTC `Date`. Used as the lower bound for the weekly leaderboard.
 *
 * Note: DST transition weeks may be off by an hour. Acceptable for Phase 1;
 * swap to a tz lib later if it ever matters.
 */
export function weekStartCT(): Date {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  // weekday short: 'Mon', 'Tue', ...
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const ctWeekday = weekdayMap[parts.weekday] ?? 0;
  const daysSinceMonday = (ctWeekday + 6) % 7;

  // Construct the CT-wall-clock instant for "Mon 00:00" of the current CT week.
  // We do this by parsing the CT date components, building a Date in UTC for
  // those components, then offsetting back to UTC by the current CT offset.
  const ctY = Number(parts.year);
  const ctM = Number(parts.month);
  const ctD = Number(parts.day);
  const ctMidnightAsIfUTC = Date.UTC(ctY, ctM - 1, ctD, 0, 0, 0);
  const offsetMs = ctMidnightAsIfUTC - new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' })).getTime() + (now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' })).getTime());
  // Simpler: compute current CT offset by formatting "now" in CT and parsing.
  // Replace the above complicated line with the minimal correct formula:
  const utcAsCt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const utcOffsetMs = now.getTime() - utcAsCt.getTime();

  // CT-local instant for today 00:00:
  const ctTodayMidnight = new Date(Date.UTC(ctY, ctM - 1, ctD, 0, 0, 0));
  // Apply the offset to convert that wall-clock to a real UTC instant.
  const realCtTodayMidnight = new Date(ctTodayMidnight.getTime() + utcOffsetMs);
  // Subtract days back to Monday.
  const realMondayMidnight = new Date(
    realCtTodayMidnight.getTime() - daysSinceMonday * 24 * 3600 * 1000,
  );
  return realMondayMidnight;
}
```

A note on the `weekStartCT` implementation: timezone math is brittle. The above uses `Intl.DateTimeFormat` to grab CT wall-clock components, then offsets to a UTC instant. The tests in Step 1 verify the result is a Monday-00:00 instant in CT, which is what the leaderboard query needs. If the tests pass, the implementation is correct enough.

- [ ] **Step 4: Run the tests — expect all pass**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun test 2>&1 | tail -20
```

Expected: all tests pass. If any fail, fix the implementation in `scoring.ts` (not the tests). The aggregation tests are unambiguous; only `weekStartCT` may need tweaking.

If `weekStartCT` tests fail because the CT offset calculation is off, simplify the function with a direct approach:

```ts
export function weekStartCT(): Date {
  const now = new Date();
  // Format current instant as CT components
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    // sv-SE produces ISO-ish "YYYY-MM-DD HH:mm:ss"
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
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
```

Use whichever passes the tests. Don't merge a flaky `weekStartCT`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live"
git add apps/web/package.json apps/web/src/lib/scoring.ts apps/web/tests/lib/scoring.test.ts
git commit -m "phase-1: scoring lib + tests (aggregateLeaderboard, weekStartCT)"
```

---

## Task 5 — API route: `PATCH /api/team/scoring`

**Files:**
- Create: `apps/web/src/app/api/team/scoring/route.ts`

- [ ] **Step 1: Write the route**

```ts
// apps/web/src/app/api/team/scoring/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { workout_score?: unknown; rehab_score?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const ws = Number(body.workout_score);
  const rs = Number(body.rehab_score);
  if (!Number.isFinite(ws) || ws < 0 || ws > 100) {
    return NextResponse.json({ error: 'workout_score_out_of_range' }, { status: 400 });
  }
  if (!Number.isFinite(rs) || rs < 0 || rs > 100) {
    return NextResponse.json({ error: 'rehab_score_out_of_range' }, { status: 400 });
  }

  const sb = await createServerSupabase();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('team_id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref) return NextResponse.json({ error: 'no_team' }, { status: 403 });

  const role = (pref.role ?? 'coach') as string;
  if (role !== 'coach' && role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const newConfig = { workout_score: ws, rehab_score: rs };
  const { error } = await sb
    .from('teams')
    .update({ scoring_json: newConfig })
    .eq('id', pref.team_id);

  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, scoring_json: newConfig });
}
```

This route depends on a `createServerSupabase` helper. Check if it exists:

```bash
grep -rn "createServerSupabase\|export.*Supabase" /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live/apps/web/src/lib/ 2>/dev/null | head
```

If `apps/web/src/lib/supabase-server.ts` doesn't exist or doesn't export `createServerSupabase`, look at how OTHER API routes in `apps/web/src/app/api/` create their server-side Supabase client (e.g., `/api/preferences/route.ts` if present). Use the same import path and helper name. Adjust the import line in the route accordingly.

If the project's existing pattern is different — e.g., `import { supabaseServer } from '@/lib/...'` — match that pattern in this file.

- [ ] **Step 2: Build to verify**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`. The route table should now include `/api/team/scoring`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live"
git add apps/web/src/app/api/team/scoring
git commit -m "phase-1: PATCH /api/team/scoring (coach + admin)"
```

---

## Task 6 — Leaderboard component

**Files:**
- Create: `apps/web/src/components/v3/leaderboard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/v3/leaderboard.tsx
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { LeaderboardRow } from '@/lib/scoring';

/**
 * Leaderboard card. Renders a card with title, then a numbered list of athletes
 * with workouts/rehabs counts and total points. Top 3 ranks are emphasized.
 */
export function Leaderboard({
  title,
  rows,
  highlightPlayerId,
  emptyText = '— no points yet — text the team line to start logging.',
  className,
}: {
  title: string;
  rows: LeaderboardRow[];
  highlightPlayerId?: number;
  emptyText?: string;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-2xl bg-[color:var(--card)] border', className)}
      style={{ borderColor: 'var(--border)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-bold text-[color:var(--ink)]">{title}</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">{emptyText}</p>
      ) : (
        <ol>
          {rows.map((row, i) => {
            const rank = i + 1;
            const isTop3 = rank <= 3;
            const isMe = highlightPlayerId === row.player_id;
            return (
              <li key={row.player_id}>
                <Link
                  href={`/dashboard/player/${row.player_id}`}
                  className={cn(
                    'flex items-center gap-3 border-b px-6 py-3 transition hover:bg-[color:var(--card-hover)] last:border-b-0',
                    isMe && 'bg-[color:var(--blue-soft)]/40',
                  )}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span
                    className={cn(
                      'tabular font-bold w-8 text-center',
                      isTop3 ? 'text-[18px]' : 'text-[14px] text-[color:var(--ink-mute)]',
                    )}
                    style={isTop3 ? { color: 'var(--blue)' } : undefined}
                  >
                    {rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-[color:var(--ink)] truncate">
                      {row.name}
                      {isMe && (
                        <span className="ml-2 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--blue)]">
                          you
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-[color:var(--ink-mute)] truncate">
                      {row.group ?? 'No group'} · {row.workouts}w · {row.rehabs}r
                    </div>
                  </div>
                  <div
                    className="tabular text-[15px] font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {row.points.toFixed(row.points % 1 === 0 ? 0 : 1)}
                    <span className="ml-1 text-[11px] font-medium text-[color:var(--ink-mute)]">pt</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live"
git add apps/web/src/components/v3/leaderboard.tsx
git commit -m "phase-1: v3 Leaderboard component"
```

---

## Task 7 — Activity page: embed leaderboards

**Files:**
- Modify: `apps/web/src/app/dashboard/fitness/page.tsx`

- [ ] **Step 1: Read the current Activity page**

```bash
cat "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web/src/app/dashboard/fitness/page.tsx" | head -50
```

You'll see imports + the `FitnessPage` component. Note the existing structure.

- [ ] **Step 2: Add leaderboard imports + state + fetching**

Modify the file with the Edit tool. At the top of the file, add:

```ts
import { Leaderboard } from '@/components/v3/leaderboard';
import { computeLeaderboard, weekStartCT, type LeaderboardRow } from '@/lib/scoring';
```

Inside `FitnessPage()`, add the dashboard hook to read scoring + leaderboard state:

```tsx
const { team } = useDashboard();  // team already exists in this hook; add this only if not already destructured
const [weekRows, setWeekRows] = useState<LeaderboardRow[]>([]);
const [allTimeRows, setAllTimeRows] = useState<LeaderboardRow[]>([]);
```

If `team` is already destructured from `useDashboard()` somewhere in the page, just reuse it.

Add a new `useEffect` after the existing ones:

```tsx
useEffect(() => {
  (async () => {
    const scoring = team.scoring_json;
    const sinceISO = weekStartCT().toISOString();
    const [week, allTime] = await Promise.all([
      computeLeaderboard(sb, prefs.team_id, scoring, sinceISO),
      computeLeaderboard(sb, prefs.team_id, scoring),
    ]);
    setWeekRows(week);
    setAllTimeRows(allTime);
  })();
}, [sb, prefs.team_id, team.scoring_json]);
```

- [ ] **Step 3: Render the two leaderboard cards above the Past activity table**

Find where the Past activity table is rendered (usually inside a `<section>` with header "Past activity"). ABOVE that section, insert a new section:

```tsx
<section className="reveal reveal-2 grid gap-6 md:grid-cols-2">
  <Leaderboard title="This week" rows={weekRows} />
  <Leaderboard title="All time" rows={allTimeRows} />
</section>
```

Adjust the `reveal-N` class so subsequent sections still have a sensible reveal order. If "Past activity" was `reveal-3`, leave it; or shuffle reveal indices in the order they appear.

- [ ] **Step 4: Build**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`. If there's a TypeScript error about `team.scoring_json`, the Team type extension from Task 2 didn't propagate — re-run Task 2 step 3 to confirm the type is exported and re-imported correctly.

- [ ] **Step 5: Commit**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live"
git add apps/web/src/app/dashboard/fitness/page.tsx
git commit -m "phase-1: Activity page — embed weekly + all-time leaderboards"
```

---

## Task 8 — Athlete view: personal rank chip

**Files:**
- Modify: `apps/web/src/app/dashboard/athlete/page.tsx`

- [ ] **Step 1: Read the current Athlete page**

```bash
cat "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web/src/app/dashboard/athlete/page.tsx" | head -60
```

- [ ] **Step 2: Add imports + rank state + fetch**

At the top of the file, add:

```ts
import { computeLeaderboard, weekStartCT, type LeaderboardRow } from '@/lib/scoring';
```

Inside `AthletePage`, in the SELECTED MODE branch (where `me` is non-null), add state and a useEffect:

```tsx
const [weekRank, setWeekRank] = useState<number | null>(null);
const [allTimeRank, setAllTimeRank] = useState<number | null>(null);

useEffect(() => {
  if (!me) return;
  (async () => {
    const scoring = team.scoring_json;
    const sinceISO = weekStartCT().toISOString();
    const [week, allTime] = await Promise.all([
      computeLeaderboard(sb, prefs.team_id, scoring, sinceISO),
      computeLeaderboard(sb, prefs.team_id, scoring),
    ]);
    const findRank = (rows: LeaderboardRow[], pid: number): number | null => {
      const idx = rows.findIndex((r) => r.player_id === pid);
      return idx === -1 ? null : idx + 1;
    };
    setWeekRank(findRank(week, me.id));
    setAllTimeRank(findRank(allTime, me.id));
  })();
}, [sb, prefs.team_id, team.scoring_json, me?.id]);
```

If `team` isn't already in the destructure of `useDashboard()` in this page, add it.

- [ ] **Step 3: Render the rank chip in the selected-mode header area**

Find the section in the SELECTED MODE return where the page header / hero area is rendered. Just below the page title or near the stats hero, add:

```tsx
<div className="text-[12px] text-[color:var(--ink-mute)]">
  Your rank:{' '}
  <span className="font-semibold text-[color:var(--ink)]">
    {weekRank != null ? `#${weekRank} this week` : 'unranked this week'}
  </span>
  {' · '}
  <span className="font-semibold text-[color:var(--ink)]">
    {allTimeRank != null ? `#${allTimeRank} all-time` : 'unranked all-time'}
  </span>
</div>
```

Place it logically — for example, immediately after the page header subtitle line, OR as a small line above the stats hero row. Pick whichever fits the existing visual rhythm.

- [ ] **Step 4: Build**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live"
git add apps/web/src/app/dashboard/athlete/page.tsx
git commit -m "phase-1: Athlete view — personal rank chip (this week + all-time)"
```

---

## Task 9 — Settings: add Scoring card (coach + admin)

**Files:**
- Modify: `apps/web/src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Read the current Settings page**

```bash
cat "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web/src/app/dashboard/settings/page.tsx" | head -80
```

Note the section structure (Role / view, Phone OTP, Preferences, Account, Database, Worker health).

- [ ] **Step 2: Add Scoring state + handler**

Inside `SettingsPage()`, add:

```tsx
const canConfigureScoring = currentRole === 'coach' || currentRole === 'admin';
const [workoutScore, setWorkoutScore] = useState<string>('1.0');
const [rehabScore, setRehabScore] = useState<string>('0.5');
const [scoringSaving, setScoringSaving] = useState(false);
const [scoringStatus, setScoringStatus] = useState<string | null>(null);
```

In the `refresh()` async function (which already loads team data), after `setTeam(...)`, add:

```tsx
const sc = (teamData as Team)?.scoring_json;
if (sc) {
  setWorkoutScore(String(sc.workout_score ?? 1.0));
  setRehabScore(String(sc.rehab_score ?? 0.5));
}
```

Add a save handler:

```tsx
async function saveScoring() {
  setScoringSaving(true);
  setScoringStatus(null);
  const ws = Number(workoutScore);
  const rs = Number(rehabScore);
  if (!Number.isFinite(ws) || ws < 0 || !Number.isFinite(rs) || rs < 0) {
    setScoringStatus('Values must be non-negative numbers.');
    setScoringSaving(false);
    return;
  }
  const res = await fetch('/api/team/scoring', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workout_score: ws, rehab_score: rs }),
  });
  if (res.ok) {
    setScoringStatus('Saved.');
    await refresh();
  } else {
    const j = await res.json().catch(() => ({}));
    setScoringStatus(j.error ? `Error: ${j.error}` : 'Save failed.');
  }
  setScoringSaving(false);
}
```

- [ ] **Step 3: Render the Scoring card**

Insert this section between the Role / view card and the Phone OTP card. Wrap the whole block in `{canConfigureScoring && ( ... )}`:

```tsx
{canConfigureScoring && (
  <section
    className="rounded-2xl bg-[color:var(--card)] border p-6"
    style={{ borderColor: 'var(--border)' }}
  >
    <header className="mb-2">
      <h2 className="text-base font-bold text-[color:var(--ink)]">Scoring</h2>
      <p className="mt-1 text-[13px] text-[color:var(--ink-mute)]">
        Points awarded per logged activity. Affects this team&rsquo;s leaderboards.
      </p>
    </header>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div>
        <Label>Workout</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            type="number"
            step="0.5"
            min="0"
            max="100"
            value={workoutScore}
            onChange={(e) => setWorkoutScore(e.target.value)}
            className="w-24"
          />
          <span className="text-[13px] text-[color:var(--ink-mute)]">points</span>
        </div>
      </div>
      <div>
        <Label>Rehab</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            type="number"
            step="0.5"
            min="0"
            max="100"
            value={rehabScore}
            onChange={(e) => setRehabScore(e.target.value)}
            className="w-24"
          />
          <span className="text-[13px] text-[color:var(--ink-mute)]">points</span>
        </div>
      </div>
    </div>
    <div className="mt-5 flex items-center gap-3">
      <Button
        onClick={saveScoring}
        disabled={scoringSaving}
        className="rounded-xl font-semibold"
        style={{ background: 'var(--blue)' }}
      >
        {scoringSaving ? 'Saving…' : 'Save scoring'}
      </Button>
      {scoringStatus && (
        <span className="text-[12.5px] text-[color:var(--ink-mute)]">{scoringStatus}</span>
      )}
    </div>
  </section>
)}
```

If `Label` and `Input` and `Button` aren't already imported in this file, add them. They likely are (the page uses them for other fields).

- [ ] **Step 4: Build**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Don't commit yet** — bundle Task 10 (role-switcher fix) into the same Settings commit.

---

## Task 10 — Settings: role-switcher click-to-save UX fix

**Files:**
- Modify: `apps/web/src/app/dashboard/settings/page.tsx` (continued)

- [ ] **Step 1: Refactor the role tile click handler**

In Settings, find the existing role tile `<button>` block. Currently it calls `setRole(opt.value)` which only updates local state, and a separate "Save preferences" button persists. The fix: clicking a role tile saves immediately and shows inline confirmation.

Add a new handler near the existing `save()` function:

```tsx
async function setRoleAndSave(newRole: UserRole) {
  if (!prefs) return;
  if (newRole === role) return;
  setRole(newRole);
  setStatus(`Switching to ${newRole.charAt(0).toUpperCase() + newRole.slice(1)} view…`);
  await fetch('/api/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      team_id: prefs.team_id,
      watchlist: prefs.watchlist,
      group_filter: prefs.group_filter,
      role: newRole,
      // Keep existing impersonate target if switching away from athlete
      impersonate_player_id: newRole === 'athlete' ? prefs.impersonate_player_id : null,
    }),
  });
  await refresh();
  await refreshShell();
  setStatus(`Switched to ${newRole.charAt(0).toUpperCase() + newRole.slice(1)} view.`);
  setTimeout(() => setStatus(null), 2200);
}
```

Update the role tile's `onClick`:

```tsx
onClick={() => setRoleAndSave(opt.value)}
```

The tile is now disabled in a UX sense while the click is in flight. Optionally add a `disabled={status?.startsWith('Switching')}` to all three tiles to prevent double-clicks.

- [ ] **Step 2: Remove the "save preferences" button's responsibility for role**

The existing `save()` function still POSTs role. That's fine — it's the umbrella save for group_filter + watchlist + role. Leave it alone. Result: tiles save immediately AND the bottom save button still works for other prefs. No conflict.

- [ ] **Step 3: Build**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit Tasks 9 + 10**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live"
git add apps/web/src/app/dashboard/settings/page.tsx
git commit -m "phase-1: Settings — Scoring card + click-to-save role switcher"
```

---

## Task 11 — Final build, push, mark task complete

- [ ] **Step 1: Run full test suite**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live/apps/web"
bun test 2>&1 | tail -15
```

Expected: all `aggregateLeaderboard` + `weekStartCT` tests pass. If any fail, STOP and fix before proceeding.

- [ ] **Step 2: Final build**

```bash
bun run build 2>&1 | tail -25
```

Expected: `✓ Compiled successfully` plus the route table now includes `/api/team/scoring`. All routes still listed (no regressions).

- [ ] **Step 3: Push to main**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/Assignments/Assignment4/reflect-live"
git push 2>&1 | tail -5
```

Expected: push succeeds, lists the Phase 1 commits going to `origin/main`.

- [ ] **Step 4: Visual verify on Vercel preview**

Once Vercel finishes deploying (~90s):

1. Sign in as a coach.
2. Navigate to `/dashboard/fitness` — confirm two leaderboard cards render above the Past activity table. With no live workout/rehab messages yet, both leaderboards should show the empty-state text.
3. Navigate to `/dashboard/settings` — confirm the new Scoring card appears (visible to coach + admin only). Edit values, click Save scoring, confirm "Saved." status. Refresh — values persist.
4. Click a different role tile (Coach → Captain). Confirm inline status changes to "Switching…" then "Switched." Confirm the dashboard shell re-routes per the new role on next nav.
5. Switch to Athlete role with an impersonate target → Activity page leaderboards still render. The "Your rank" chip should appear on the My-view page.

- [ ] **Step 5: Mark Phase 1 task done**

Use TaskUpdate tool to mark task #14 as `completed`.

---

## Self-review against the spec

**1. Spec coverage:**
- §2 source-of-truth (twilio_messages workout/rehab) → Task 4 (`computeLeaderboard` filters in the supabase query)
- §3 schema → Task 1
- §4 scoring computation → Task 4 (`aggregateLeaderboard`, `computeLeaderboard`)
- §5 weekly window → Task 4 (`weekStartCT`)
- §6.1 leaderboard cards on Activity page → Task 7
- §6.2 athlete personal rank chip → Task 8
- §6.3 Settings Scoring card (coach + admin) → Task 9
- §6.4 role-switcher UX fix → Task 10
- §7 PATCH API route → Task 5
- §8 dashboard-shell context auto-includes scoring_json → Task 2 (type extension; runtime is automatic since the `useDashboard` hook already SELECTs `*` from teams)
- §9 file list → matches the create/modify lists in this plan
- §10 tests → Task 4

All sections covered.

**2. Placeholder scan:** none. Every step has actual code or commands.

**3. Type consistency:**
- `TeamScoring` defined in Task 4's scoring.ts AND extended in `Team` interface in Task 2. Both use `{ workout_score: number; rehab_score: number }`. Consistent.
- `LeaderboardRow` defined once in scoring.ts, imported by both Activity (Task 7) and Athlete (Task 8) pages and the Leaderboard component (Task 6).
- Method signatures: `aggregateLeaderboard(players, messages, scoring)` and `computeLeaderboard(sb, teamId, scoring, sinceISO?)` are referenced consistently across Tasks 4, 7, 8.

No type drift detected.

---

## Open questions (none blocking)

- The `weekStartCT()` implementation has a complicated offset calculation. If it's flaky, swap to `date-fns-tz` (small dep). For Phase 1, ship with the Intl-only approach and rely on the unit tests for correctness.
- If RLS on `teams` UPDATE doesn't already permit non-admins to update their team, Task 5's API route will hit `update_failed` for coaches. If observed, add to migration 0009: a small policy update. Verify by clicking Save scoring as a coach in step 4 of Task 11; if it fails, check the Supabase RLS policies and add `WITH CHECK (id = team_id_from_jwt())` or similar matching the existing pattern.
