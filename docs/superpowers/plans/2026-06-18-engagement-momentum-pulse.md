# Engagement & Momentum Pulse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard's crude "no text in 24h" attention signal with a per-athlete, baseline-relative training-momentum engine, and surface both directions ("who's doing more or less over the past X days") without adding any new page or nav item.

**Architecture:** A pure `computeEngagement()` lib classifies each athlete's activity-log count over a coach-selected window against their own trailing-4-window baseline (heating / steady / cooling / quiet / new). A thin client hook fetches the data and runs the engine. Two existing Dashboard surfaces consume it — `NeedsAttention` (the down side: quiet + low-readiness) and a new `MoversCard` that replaces the weak "Recent activity" teaser (both sides: ↑ heating / ↓ cooling). The redundant competition-page volume strip is retired in favor of a breadcrumb. No schema change.

**Tech Stack:** Next.js 16 (App Router, client components), TypeScript ESM, Supabase JS client (browser, RLS-scoped) via `useSupabase`, Tailwind v4, `bun test` (vitest-style imports) for the pure lib.

**Spec:** `docs/superpowers/specs/2026-06-18-weekly-engagement-pulse-design.md` (this branch's copy is the authoritative v2 with momentum + configurable window).

---

## File structure

| File | Responsibility | Task |
|------|----------------|------|
| `apps/web/src/lib/engagement.ts` | **New.** Pure engine: window vs. baseline → buckets + signed delta. No I/O. | 1 |
| `apps/web/src/lib/engagement.test.ts` | **New.** Unit tests for the engine (`bun test`). | 1 |
| `apps/web/src/lib/use-engagement.ts` | **New.** Client hook: fetch active players + recent `activity_logs`, run the engine, return rows + loading. DRY for both consumers. | 2 |
| `apps/web/src/components/v3/needs-attention.tsx` | **Modify.** Down-side panel: quiet (from engine) + low readiness (kept). Add `windowDays` prop. | 3 |
| `apps/web/src/components/v3/movers-card.tsx` | **New.** Both-direction trend card: ↑ heating / ↓ cooling. | 4 |
| `apps/web/src/app/dashboard/page.tsx` | **Modify.** Pass `windowDays` to `NeedsAttention`; swap the "Recent activity" teaser for `<MoversCard>`; drop `recentActivity` state + fetch. | 5 |
| `apps/web/src/app/dashboard/competitions/page.tsx` | **Modify.** Remove the 30-day volume strip + its state/fetch; add a "Team pulse →" breadcrumb. | 6 |

## Parallel execution waves

Dependency graph for the orchestrator (worktree is shared, so file-disjoint tasks parallelize safely):

- **Wave A (parallel):** Task 1 (engine) ‖ Task 6 (competition strip retire — touches no shared file, depends on nothing).
- **Wave B:** Task 2 (hook) — needs Task 1's exports.
- **Wave C (parallel):** Task 3 (`needs-attention.tsx`) ‖ Task 4 (`movers-card.tsx`) — disjoint files, both need Task 2.
- **Wave D:** Task 5 (`page.tsx` wiring) — needs Tasks 3 + 4 to exist.

## Conventions (read before starting)

- **All work happens on branch `feat/engagement-momentum` in this worktree.** Commit per task. Stage **specific files only** — never `git add .`/`-A`.
- Verify commands run from the repo root unless noted:
  - Engine tests: `bun --cwd apps/web test src/lib/engagement.test.ts`
  - Typecheck: `bun run typecheck` · Lint: `bun run lint` · Build: `bun run build:web`
- Don't add comments/types to code you didn't change. Match surrounding idiom.
- Definition of done for any UI task = typecheck + lint + build all green (a 200 ≠ a rendered page).

---

## Task 1: Engagement engine (pure lib, TDD)

**Files:**
- Create: `apps/web/src/lib/engagement.ts`
- Test: `apps/web/src/lib/engagement.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/engagement.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeEngagement, type EngagementInput } from './engagement';

const DAY_MS = 24 * 3600 * 1000;
const NOW = Date.parse('2026-06-18T12:00:00Z');

// A log `d` days before NOW for the given player.
function log(player_id: number, d: number) {
  return { player_id, logged_at: new Date(NOW - d * DAY_MS).toISOString() };
}

// Build input at a 7-day window with one player and an explicit log set.
function input(logs: EngagementInput['logs'], windowDays: number | null = 7): EngagementInput {
  return {
    players: [{ id: 1, name: 'Ada', group: 'Sprint' }],
    logs,
    windowDays,
    now: NOW,
  };
}

function only(rows: ReturnType<typeof computeEngagement>) {
  return rows.find((r) => r.player_id === 1)!;
}

describe('computeEngagement', () => {
  it('flags a regular who went silent as quiet', () => {
    // baseline: 12 logs in days 8–35 (~3/wk); window: 0
    const baseline = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32].map((d) => log(1, d));
    const r = only(computeEngagement(input(baseline)));
    expect(r.bucket).toBe('quiet');
    expect(r.windowCount).toBe(0);
    expect(r.baselineRate).toBe(3);
  });

  it('flags a regular who halved as cooling', () => {
    // baseline 16 logs in days 8–35 (4/wk); window: 1 log
    const baseline = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 34, 12, 14].map((d) => log(1, d));
    const r = only(computeEngagement(input([...baseline, log(1, 2)])));
    expect(r.bucket).toBe('cooling');
    expect(r.windowCount).toBe(1);
  });

  it('flags a ramping regular as heating', () => {
    // baseline 8 logs in days 8–35 (2/wk); window: 5 logs
    const baseline = [10, 14, 18, 22, 26, 30, 12, 16].map((d) => log(1, d));
    const windowLogs = [1, 2, 3, 4, 5].map((d) => log(1, d));
    const r = only(computeEngagement(input([...baseline, ...windowLogs])));
    expect(r.bucket).toBe('heating');
    expect(r.windowCount).toBe(5);
  });

  it('flags a previously-inactive athlete who is now logging as heating', () => {
    // no baseline; window: 3 logs (max(baseline,1) lets this read as heating)
    const r = only(computeEngagement(input([1, 2, 3].map((d) => log(1, d)))));
    expect(r.bucket).toBe('heating');
  });

  it('treats a steady regular as steady (not flagged)', () => {
    // baseline 16 logs (4/wk); window 4 logs — neither heating nor cooling
    const baseline = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 34, 12, 14].map((d) => log(1, d));
    const windowLogs = [1, 2, 3, 4].map((d) => log(1, d));
    const r = only(computeEngagement(input([...baseline, ...windowLogs])));
    expect(r.bucket).toBe('steady');
  });

  it('treats a never-engaged athlete as new (not flagged)', () => {
    const r = only(computeEngagement(input([])));
    expect(r.bucket).toBe('new');
    expect(r.baselineRate).toBe(0);
  });

  it('includes baseline exactly at the regular floor', () => {
    // baseline 8 logs in days 8–35 (= 2/wk = REGULAR_FLOOR); window 0 → quiet
    const baseline = [10, 13, 16, 19, 22, 25, 28, 31].map((d) => log(1, d));
    const r = only(computeEngagement(input(baseline)));
    expect(r.baselineRate).toBe(2);
    expect(r.bucket).toBe('quiet');
  });

  it('treats cooling boundary (windowCount == baseline×0.5) as cooling', () => {
    // baseline 16 logs (4/wk); window exactly 2 (= 0.5×4)
    const baseline = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 34, 12, 14].map((d) => log(1, d));
    const r = only(computeEngagement(input([...baseline, log(1, 2), log(1, 3)])));
    expect(r.windowCount).toBe(2);
    expect(r.bucket).toBe('cooling');
  });

  it('windowDays = null ("all") returns raw all-time counts as new', () => {
    const logs = [1, 9, 40, 100].map((d) => log(1, d));
    const r = only(computeEngagement(input(logs, null)));
    expect(r.bucket).toBe('new');
    expect(r.windowCount).toBe(4);
    expect(r.baselineRate).toBe(0);
  });

  it('reports the most recent log as lastActive', () => {
    const r = only(computeEngagement(input([log(1, 2), log(1, 20)])));
    expect(r.lastActive).toBe(new Date(NOW - 2 * DAY_MS).toISOString());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun --cwd apps/web test src/lib/engagement.test.ts`
Expected: FAIL — `Cannot find module './engagement'` (file doesn't exist yet).

- [ ] **Step 3: Write the engine**

Create `apps/web/src/lib/engagement.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun --cwd apps/web test src/lib/engagement.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: clean (no errors).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/engagement.ts apps/web/src/lib/engagement.test.ts
git commit -m "feat(engagement): pure momentum engine — window vs. baseline buckets"
```

---

## Task 2: `useEngagement` client hook

**Files:**
- Create: `apps/web/src/lib/use-engagement.ts`

This hook is verified by typecheck + downstream consumers (Tasks 3–5) rather than a unit test — the repo has no React-hook test harness (RTL is not set up), and inventing one is out of scope. Keep it thin so typecheck is meaningful coverage.

- [ ] **Step 1: Write the hook**

Create `apps/web/src/lib/use-engagement.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from './supabase-browser';
import {
  computeEngagement,
  type EngagementRow,
  type EngagementPlayer,
  type EngagementLog,
} from './engagement';

const DAY_MS = 24 * 3600 * 1000;
const BASELINE_WINDOWS = 4;

// Fetches active roster + recent activity_logs (RLS-scoped to the team) and
// runs the pure engine. Window null = "all"; we then pull a wide history.
export function useEngagement(
  teamId: number,
  windowDays: number | null,
  groupFilter: string | null,
) {
  const sb = useSupabase();
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const now = Date.now();
      // Cover the window plus the 4 baseline windows before it.
      const spanDays = windowDays == null ? 3650 : windowDays * (BASELINE_WINDOWS + 1);
      const since = new Date(now - spanDays * DAY_MS).toISOString();

      const pq = sb
        .from('players')
        .select('id,name,group')
        .eq('team_id', teamId)
        .eq('active', true);
      if (groupFilter) pq.eq('group', groupFilter);

      const [{ data: players }, { data: logs }] = await Promise.all([
        pq,
        sb
          .from('activity_logs')
          .select('player_id,logged_at')
          .eq('team_id', teamId)
          .eq('hidden', false)
          .gte('logged_at', since),
      ]);
      if (!alive) return;

      setRows(
        computeEngagement({
          players: (players ?? []) as EngagementPlayer[],
          logs: (logs ?? []) as EngagementLog[],
          windowDays,
          now,
        }),
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, teamId, windowDays, groupFilter]);

  return { rows, loading };
}
```

> Note (not a blocker): Supabase caps `.select()` at 1000 rows. For a single team over `windowDays × 5`, that's far under the cap; the existing competition volume strip fetched `activity_logs` the same single-shot way. If "all" ever exceeds 1000 for a huge team, paginate like `dashboard/page.tsx` does for `twilio_messages`. Out of scope for v1.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: clean. (No consumer yet, but the hook + engine types must line up.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/use-engagement.ts
git commit -m "feat(engagement): useEngagement hook — fetch + run engine, RLS-scoped"
```

---

## Task 3: Rewire `NeedsAttention` to the engine (down side + readiness)

**Files:**
- Modify: `apps/web/src/components/v3/needs-attention.tsx` (full rewrite of the data logic; markup largely preserved)

The panel keeps its job — the *act-now* list — but its activity signal now comes from the engine (`quiet` only; `cooling` lives in the Movers card). The low-readiness flag is unchanged. New prop `windowDays`.

- [ ] **Step 1: Replace the component**

Replace the entire contents of `apps/web/src/components/v3/needs-attention.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSupabase } from '@/lib/supabase-browser';
import { useEngagement } from '@/lib/use-engagement';
import { Pill } from './pill';
import { relativeTime } from '@/lib/format';

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

type Reason = 'low' | 'quiet';

interface Flagged {
  player_id: number;
  name: string;
  group: string | null;
  reason: Reason;
  readiness: number | null;
  lastActive: string | null;
  severity: number;
}

export function NeedsAttention({
  teamId,
  windowDays = 7,
  groupFilter = null,
}: {
  teamId: number;
  windowDays?: number | null;
  groupFilter?: string | null;
}) {
  const sb = useSupabase();
  const { rows, loading: engLoading } = useEngagement(teamId, windowDays, groupFilter);
  const [readiness, setReadiness] = useState<Map<number, number>>(new Map());
  const [readyLoading, setReadyLoading] = useState(true);

  // Latest survey readiness per player (last 7d) — a separate, acute signal.
  useEffect(() => {
    let alive = true;
    (async () => {
      setReadyLoading(true);
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data: msgs } = await sb
        .from('twilio_messages')
        .select('player_id,category,body,date_sent')
        .eq('team_id', teamId)
        .eq('hidden', false)
        .eq('category', 'survey')
        .gte('date_sent', since)
        .order('date_sent', { ascending: false });
      if (!alive) return;
      const latest = new Map<number, number>();
      for (const m of (msgs ?? []) as Array<{ player_id: number | null; body: string | null }>) {
        if (m.player_id == null || latest.has(m.player_id) || !m.body) continue;
        const match = /^(\d{1,2})/.exec(m.body.trim());
        if (match) {
          const n = Number(match[1]);
          if (n >= 1 && n <= 10) latest.set(m.player_id, n);
        }
      }
      setReadiness(latest);
      setReadyLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, teamId]);

  const loading = engLoading || readyLoading;

  // Build the act-now list: low readiness (highest priority) + quiet regulars.
  const flagged: Flagged[] = [];
  for (const r of rows) {
    const read = readiness.get(r.player_id) ?? null;
    if (read != null && read <= 4) {
      flagged.push({
        player_id: r.player_id, name: r.name, group: r.group, reason: 'low',
        readiness: read, lastActive: r.lastActive, severity: 10_000 + (100 - read * 10),
      });
    } else if (r.bucket === 'quiet') {
      flagged.push({
        player_id: r.player_id, name: r.name, group: r.group, reason: 'quiet',
        readiness: read, lastActive: r.lastActive, severity: r.severity,
      });
    }
  }
  flagged.sort((a, b) => b.severity - a.severity);

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold text-[color:var(--ink)]">Needs attention</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{flagged.length}</span>
      </header>
      {loading ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
      ) : flagged.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
          — everyone&rsquo;s on the wire —
        </p>
      ) : (
        <ul>
          {flagged.slice(0, 8).map((f) => (
            <li key={f.player_id}>
              <Link
                href={`/dashboard/players/${f.player_id}`}
                className="flex items-center gap-3 border-b px-6 py-3 transition hover:bg-[color:var(--card-hover)] last:border-b-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <span
                  className="grid size-8 place-items-center rounded-md border bg-[color:var(--paper)] text-[10.5px] font-bold text-[color:var(--ink-soft)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {initials(f.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[color:var(--ink)] truncate">{f.name}</div>
                  <div className="text-[11.5px] text-[color:var(--ink-mute)] truncate">
                    {f.group ?? 'No group'}
                    {f.reason === 'quiet'
                      ? f.lastActive
                        ? ` · last logged ${relativeTime(f.lastActive)}`
                        : ' · no logs'
                      : f.lastActive
                        ? ` · last logged ${relativeTime(f.lastActive)}`
                        : ''}
                  </div>
                </div>
                {f.reason === 'low' && f.readiness != null ? (
                  <Pill tone="red">readiness {f.readiness}</Pill>
                ) : (
                  <Pill tone="amber">quiet</Pill>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: clean. (Lint will flag rules-of-hooks issues — there should be none; `useEngagement` and `useEffect` are both top-level.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/v3/needs-attention.tsx
git commit -m "feat(engagement): NeedsAttention reads training drop-off, not 24h silence"
```

> Note: `windowDays` defaults to `7`, so the existing `page.tsx` call `<NeedsAttention teamId={prefs.team_id} />` still typechecks after this task — each task stays independently green. Task 5 upgrades that call to pass the live window + group filter.

---

## Task 4: `MoversCard` (both directions)

**Files:**
- Create: `apps/web/src/components/v3/movers-card.tsx`

The trend view — the direct answer to "who's doing more or less over the past X days." Two compact columns from the same engine.

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/v3/movers-card.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEngagement } from '@/lib/use-engagement';
import type { EngagementRow } from '@/lib/engagement';
import { TrendingUp, TrendingDown } from 'lucide-react';

// baseline-rounded → window count, e.g. "2 → 6"
function moveLabel(r: EngagementRow): string {
  return `${Math.round(r.baselineRate)} → ${r.windowCount}`;
}

function MoverRow({ r, dir }: { r: EngagementRow; dir: 'up' | 'down' }) {
  return (
    <li>
      <Link
        href={`/dashboard/players/${r.player_id}`}
        className="flex items-center justify-between gap-3 border-b px-6 py-2.5 transition hover:bg-[color:var(--card-hover)] last:border-b-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-[color:var(--ink)] truncate">{r.name}</div>
          <div className="text-[11px] text-[color:var(--ink-mute)] truncate">{r.group ?? 'No group'}</div>
        </div>
        <span
          className="tabular text-[12.5px] font-semibold shrink-0"
          style={{ color: dir === 'up' ? 'var(--green)' : 'var(--amber)' }}
        >
          {moveLabel(r)}
        </span>
      </Link>
    </li>
  );
}

function Column({
  title,
  icon,
  rows,
  dir,
}: {
  title: string;
  icon: React.ReactNode;
  rows: EngagementRow[];
  dir: 'up' | 'down';
}) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-1.5 px-6 pt-4 pb-2">
        {icon}
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-[color:var(--ink-mute)]">{title}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-6 text-[12.5px] text-[color:var(--ink-mute)]">—</p>
      ) : (
        <ul>{rows.map((r) => <MoverRow key={r.player_id} r={r} dir={dir} />)}</ul>
      )}
    </div>
  );
}

export function MoversCard({
  teamId,
  windowDays,
  groupFilter = null,
}: {
  teamId: number;
  windowDays: number | null;
  groupFilter?: string | null;
}) {
  const { rows, loading } = useEngagement(teamId, windowDays, groupFilter);

  // "all" has no baseline → show one ranked "most active overall" list.
  const isAll = windowDays == null;

  const heating = rows
    .filter((r) => r.bucket === 'heating')
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 4);
  const cooling = rows
    .filter((r) => r.bucket === 'cooling')
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 4);
  const mostActive = [...rows]
    .filter((r) => r.windowCount > 0)
    .sort((a, b) => b.windowCount - a.windowCount)
    .slice(0, 6);

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold text-[color:var(--ink)]">{isAll ? 'Most active' : 'Movers'}</h2>
      </header>
      {loading ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
      ) : isAll ? (
        mostActive.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— no activity —</p>
        ) : (
          <ul>{mostActive.map((r) => <MoverRow key={r.player_id} r={r} dir="up" />)}</ul>
        )
      ) : heating.length === 0 && cooling.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— steady week, no movers —</p>
      ) : (
        <div className="flex flex-col sm:flex-row sm:divide-x" style={{ borderColor: 'var(--border)' }}>
          <Column title="Heating up" icon={<TrendingUp className="size-3.5" style={{ color: 'var(--green)' }} />} rows={heating} dir="up" />
          <Column title="Cooling off" icon={<TrendingDown className="size-3.5" style={{ color: 'var(--amber)' }} />} rows={cooling} dir="down" />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: clean (the new component compiles standalone; `lucide-react` icons `TrendingUp`/`TrendingDown` exist and are already used elsewhere via `lucide-react`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/v3/movers-card.tsx
git commit -m "feat(engagement): MoversCard — ↑ heating / ↓ cooling over the selected window"
```

---

## Task 5: Wire the Dashboard (window + swap teaser → Movers)

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`

Three edits: import `MoversCard`; pass the selected window to `NeedsAttention`; replace the "Recent activity" section (and remove its state/fetch) with `<MoversCard>`.

- [ ] **Step 1: Add the import**

In `apps/web/src/app/dashboard/page.tsx`, add near the other `@/components/v3/*` imports (the file already imports `NeedsAttention` from `@/components/v3/needs-attention`):

```tsx
import { MoversCard } from '@/components/v3/movers-card';
```

- [ ] **Step 2: Remove the `recentActivity` state and its fetch**

Delete this state line (around line 52):

```tsx
  const [recentActivity, setRecentActivity] = useState<ActivityWithPlayer[]>([]);
```

Delete the entire "Recent activity teaser" `useEffect` (around lines 197–209):

```tsx
  // Recent activity teaser
  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from('activity_logs')
        .select('*, player:players(name, group)')
        .eq('team_id', prefs.team_id)
        .eq('hidden', false)
        .order('logged_at', { ascending: false })
        .limit(4);
      setRecentActivity((data ?? []) as ActivityWithPlayer[]);
    })();
  }, [sb, prefs.team_id]);
```

If the `ActivityWithPlayer` interface (around lines 33–35) and the now-unused imports `Pill`, `stripProtocolPrefix`, `relativeTime`, `ActivityLog` become unused, remove exactly the ones lint flags — run `bun run lint` to see which. (Keep `daysUntilCalendarDate`, `humanizeDaysUntil`, `prettyCalendarDate`, `Star`, `Location`, `TwilioMessage` — still used by the Upcoming section.)

- [ ] **Step 3: Compute the window value and pass it to `NeedsAttention`**

The page already has `const [days, setDays] = useState<Period>(7);`. Add a derived window just before the `return` (near line 211, by `periodSubtitle`):

```tsx
  // PeriodToggle drives the engagement window; 'all' → null (no baseline).
  const windowDays = typeof days === 'number' ? days : null;
```

Change the `NeedsAttention` usage (around line 325) from:

```tsx
          <NeedsAttention teamId={prefs.team_id} />
```

to:

```tsx
          <NeedsAttention teamId={prefs.team_id} windowDays={windowDays} groupFilter={prefs.group_filter} />
```

- [ ] **Step 4: Replace the "Recent activity" section with `<MoversCard>`**

Replace the entire `{/* Recent activity teaser */}` `<section>…</section>` block (around lines 328–373) with:

```tsx
        {/* Movers — who's doing more or less over the selected window. Replaces
            the old recent-activity teaser; same engine as Needs attention. */}
        <section className="reveal reveal-4">
          <MoversCard teamId={prefs.team_id} windowDays={windowDays} groupFilter={prefs.group_filter} />
        </section>
```

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: clean. If lint reports an unused import/interface, delete exactly that symbol and re-run.

- [ ] **Step 6: Build (the real gate)**

Run: `bun run build:web`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "feat(engagement): Dashboard drives window + swaps recent-activity for Movers"
```

---

## Task 6: Retire the competition volume strip → breadcrumb

**Files:**
- Modify: `apps/web/src/app/dashboard/competitions/page.tsx`

Fully independent of the engine — removes the redundant 30-day volume strip and points coaches at the Dashboard pulse.

- [ ] **Step 1: Remove the `volume` state and its computation**

In `apps/web/src/app/dashboard/competitions/page.tsx`:

Delete the `volume` state (around line 49):

```tsx
  const [volume, setVolume] = useState({ workouts: 0, rehabs: 0, activeLoggers: 0, players: 0 });
```

In the `useEffect` `Promise.all` (around lines 56–60), remove the `logsRes` and `playersRes` fetches so only the competitions fetch remains:

```tsx
      const compRes = await fetch(`/api/competitions?team_id=${team.id}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { competitions: [] }));
```

Delete the block that computes/sets `volume` (around lines 67–73):

```tsx
      const logs = (logsRes.data ?? []) as Array<{ player_id: number; kind: string }>;
      setVolume({
        workouts: logs.filter((l) => l.kind === 'workout').length,
        rehabs: logs.filter((l) => l.kind === 'rehab').length,
        activeLoggers: new Set(logs.map((l) => l.player_id)).size,
        players: playersRes.count ?? 0,
      });
```

Delete the now-unused `since` constant (line 55) and the `avgPerPlayer` line (around line 94). Run `bun run lint` to confirm `StatCell` and `sb`/`prefs` usage — `sb` is still used for the active-competition previews, so keep it; remove the `StatCell` import only if lint flags it as unused.

**Leave the `useDashboard()` destructure and the effect's deps array (`[sb, team?.id, prefs.team_id, today]`) unchanged** — `prefs.team_id` still appears in the deps array, so `prefs` is not unused and removing it would break the deps reference. Don't churn it.

- [ ] **Step 2: Remove the volume-strip markup and add the breadcrumb**

Replace the volume-strip `<section>` (around lines 101–109):

```tsx
        {/* Volume strip */}
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6"><StatCell label="Workouts" value={volume.workouts} sub="last 30d" tone="green" /></div>
            <div className="p-6"><StatCell label="Rehabs" value={volume.rehabs} sub="last 30d" tone="amber" /></div>
            <div className="p-6"><StatCell label="Active loggers" value={volume.activeLoggers} sub={`of ${volume.players} athletes`} tone="blue" /></div>
            <div className="p-6"><StatCell label="Avg per athlete" value={avgPerPlayer} sub="last 30d" /></div>
          </div>
        </section>
```

with a quiet breadcrumb:

```tsx
        {/* Activity volume now lives on the Dashboard pulse (Needs attention +
            Movers), not here — this page is standings only. */}
        <div className="reveal reveal-1">
          <Link href="/dashboard" className="text-[12.5px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition">
            Team pulse →
          </Link>
        </div>
```

(`Link` from `next/link` is already imported in this file.)

- [ ] **Step 3: Typecheck + lint + build**

Run: `bun run typecheck && bun run lint && bun run build:web`
Expected: all clean. Remove any symbol lint flags as unused (likely `StatCell`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/competitions/page.tsx
git commit -m "refactor(competitions): retire redundant volume strip → Team pulse breadcrumb"
```

---

## Final verification (after all tasks)

- [ ] `bun run typecheck` — clean
- [ ] `bun run lint` — clean
- [ ] `bun run build:web` — succeeds
- [ ] `bun --cwd apps/web test src/lib/engagement.test.ts` — all green
- [ ] **Manual smoke (dev):** `bun run dev:web`, sign in as a coach, open `/dashboard`:
  - Change the period toggle (7 → 14 → 30) and confirm both "Needs attention" and "Movers" re-fetch and the numbers shift.
  - Confirm "Needs attention" lists quiet/low-readiness athletes with real "last logged …" text (not "no text in 24h").
  - Confirm "Movers" shows ↑ heating / ↓ cooling with "baseline → window" numbers.
  - Open `/dashboard/competitions`: volume strip is gone, "Team pulse →" links back to `/dashboard`.
- [ ] Report what was actually observed in the browser (per CLAUDE.md: a 200 ≠ a rendered page).

## Out of scope (do not build)

- Outbound "nudge" action, Realtime auto-refresh, roster-page reuse, per-kind momentum. (See spec "Out of scope / future".)
