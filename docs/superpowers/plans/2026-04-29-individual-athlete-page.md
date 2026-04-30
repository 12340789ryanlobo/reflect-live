# Individual Athlete Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard/players/[id]` as the unified personal-dashboard page used by both an athlete viewing themselves and a coach viewing that athlete, per `docs/superpowers/specs/2026-04-29-individual-athlete-page-design.md`.

**Architecture:** Three composed components on top of an unchanged data layer plus a small backend addition: a hero (readiness + AI sentence + inline action row), a heatmap card with a three-mode toggle (Injury / Activity / Rehab), and a merged activity-and-messages timeline with a chip filter. Backend gets a TTL throttle on the existing `llm_cache` so auto-fetching the AI sentence on every visit doesn't multiply LLM calls.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (Postgres + RLS) · Clerk (server auth) · Tailwind v4 · Vitest for pure-logic tests · Bun for the dev/CI runtime.

---

## File structure

**New files:**
- `supabase/migrations/0020_llm_cache_throttle.sql` — adds `throttle_key` column + index
- `apps/web/src/lib/timeline.ts` — `TimelineEntry` type + `buildTimeline()` merger
- `apps/web/src/lib/timeline.test.ts` — vitest tests for the merger
- `apps/web/src/components/v3/athlete-hero.tsx` — hero block + inline action row
- `apps/web/src/components/v3/heatmap-tabs.tsx` — three-mode body-map card
- `apps/web/src/components/v3/unified-timeline.tsx` — merged feed with chip filter

**Modified files:**
- `apps/web/src/app/api/players/[id]/summary/route.ts` — add TTL throttle lookup; honor `?force=1`; include `created_at` in response
- `apps/web/src/app/dashboard/players/[id]/page.tsx` — compose new components; derive activity/rehab heatmap counts via existing `parseInjuryRegions`
- `apps/web/src/app/dashboard/athlete/page.tsx` — when `prefs.impersonate_player_id` is set, redirect to `/dashboard/players/[that-id]`

**Deleted files (after page refit):**
- `apps/web/src/components/v3/player-summary-card.tsx` — its content is folded into `<AthleteHero>`

---

## Task 1: TTL throttle migration

**Files:**
- Create: `supabase/migrations/0020_llm_cache_throttle.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0020: TTL throttle for llm_cache.
--
-- Existing cache_key (full hash) catches identical inputs. throttle_key
-- (per-player+period only, no data hash) lets us serve a cached row even
-- when data has shifted slightly, capping LLM calls at one per
-- LLM_CACHE_TTL_HOURS per (player, period).

alter table public.llm_cache
  add column if not exists throttle_key text;

create index if not exists idx_llm_cache_throttle
  on public.llm_cache (throttle_key, created_at desc);
```

- [ ] **Step 2: Apply via Supabase SQL editor**

In the Supabase dashboard → SQL editor, paste the file's contents and run. Verify:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'llm_cache' and column_name = 'throttle_key';
```

Expected: one row, `throttle_key | text`.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0020_llm_cache_throttle.sql
git commit -m "migration(0020): add throttle_key to llm_cache for TTL-based serve"
```

---

## Task 2: API route — TTL throttle + force regen + freshness

**Files:**
- Modify: `apps/web/src/app/api/players/[id]/summary/route.ts`

- [ ] **Step 1: Replace the cache-lookup block + write-through with the new logic**

In `apps/web/src/app/api/players/[id]/summary/route.ts`, replace the existing block from `const dataHash = hashSummaryInputs(...)` through the closing of the cache-write `await sb.from('llm_cache').upsert(...)` with:

```ts
  const dataHash = hashSummaryInputs(responses, flags);
  const cacheKey = generateCacheKey(playerId, days, dataHash);
  const throttleKey = `player:${playerId}:days:${days}`;

  const force = url.searchParams.get('force') === '1';
  const ttlHours = Number(process.env.LLM_CACHE_TTL_HOURS ?? 24);
  const ttlMs = Math.max(0, ttlHours) * 3600 * 1000;
  const ttlCutoffIso = new Date(Date.now() - ttlMs).toISOString();

  // Lookup unless force-regen.
  if (!force) {
    // (1) Exact key match — same inputs, free.
    const { data: exact } = await sb
      .from('llm_cache')
      .select('response, created_at')
      .eq('cache_key', cacheKey)
      .maybeSingle<{ response: SummaryResult; created_at: string }>();
    if (exact?.response) {
      return NextResponse.json({
        ...exact.response,
        from_cache: true,
        cached_at: exact.created_at,
      });
    }

    // (2) TTL throttle — most-recent (player, period) within window.
    if (ttlMs > 0) {
      const { data: throttled } = await sb
        .from('llm_cache')
        .select('response, created_at')
        .eq('throttle_key', throttleKey)
        .gte('created_at', ttlCutoffIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ response: SummaryResult; created_at: string }>();
      if (throttled?.response) {
        return NextResponse.json({
          ...throttled.response,
          from_cache: true,
          cached_at: throttled.created_at,
        });
      }
    }
  }

  const result = await generatePlayerSummary({
    playerId,
    playerName: player.name,
    responses,
    flags,
    days,
  });

  // Write-through cache, both keys. Skip on fallback so the next click
  // retries the LLM once it recovers.
  if (!result.error) {
    await sb.from('llm_cache').upsert(
      {
        cache_key: cacheKey,
        throttle_key: throttleKey,
        response: result,
        generated_by: result.generated_by,
      },
      { onConflict: 'cache_key' },
    );
  }

  return NextResponse.json(result);
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Smoke test against staging or local**

After Vercel auto-deploys (or against `bun run dev:web`), hit the endpoint twice in a row:

```bash
curl -X POST 'https://reflect-live-delta.vercel.app/api/players/<id>/summary?days=14' \
  -H 'Cookie: __session=<your-clerk-session>' | jq '{from_cache, cached_at, summary}'
```

Expected on second call: `from_cache: true`, `cached_at` ISO timestamp populated.

Then call again with `?force=1&days=14` — expected: `from_cache` absent or false, fresh `summary`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/players/[id]/summary/route.ts
git commit -m "feat(api): TTL throttle on player summary; force=1 bypass; cached_at in response"
```

---

## Task 3: timeline merger — pure logic + tests (TDD)

**Files:**
- Create: `apps/web/src/lib/timeline.ts`
- Create: `apps/web/src/lib/timeline.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `apps/web/src/lib/timeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTimeline, type TimelineEntry } from './timeline';
import type { ActivityLog, TwilioMessage } from '@reflect-live/shared';

function log(over: Partial<ActivityLog>): ActivityLog {
  return {
    id: 1,
    player_id: 1,
    team_id: 1,
    kind: 'workout',
    description: '',
    image_path: null,
    logged_at: '2026-04-20T10:00:00Z',
    created_at: '2026-04-20T10:00:00Z',
    source_sid: null,
    hidden: false,
    ...over,
  } as ActivityLog;
}
function msg(over: Partial<TwilioMessage>): TwilioMessage {
  return {
    sid: 'm1',
    direction: 'inbound',
    from_number: null,
    to_number: null,
    body: 'hi',
    status: null,
    error_code: null,
    error_message: null,
    num_media: null,
    media_urls: null,
    date_sent: '2026-04-20T11:00:00Z',
    team_id: 1,
    player_id: 1,
    category: 'chat',
    ingested_at: '2026-04-20T11:00:00Z',
    ...over,
  } as TwilioMessage;
}

describe('buildTimeline', () => {
  it('returns empty array when both inputs empty', () => {
    expect(buildTimeline([], [])).toEqual([]);
  });

  it('maps a workout activity_log to a workout entry', () => {
    const out = buildTimeline([log({ id: 5, kind: 'workout', description: '45 min freestyle', logged_at: '2026-04-20T07:30:00Z' })], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'log:5',
      kind: 'workout',
      ts: '2026-04-20T07:30:00Z',
      body: '45 min freestyle',
    });
  });

  it('maps a rehab activity_log to a rehab entry', () => {
    const out = buildTimeline([log({ id: 6, kind: 'rehab', description: 'knee mobility' })], []);
    expect(out[0].kind).toBe('rehab');
  });

  it('maps inbound chat message to inbound entry', () => {
    const out = buildTimeline([], [msg({ sid: 'A1', direction: 'inbound', category: 'chat', body: 'thanks coach' })]);
    expect(out[0]).toMatchObject({ id: 'msg:A1', kind: 'inbound', body: 'thanks coach' });
  });

  it('maps outbound chat message to outbound entry', () => {
    const out = buildTimeline([], [msg({ sid: 'A2', direction: 'outbound', category: 'chat' })]);
    expect(out[0].kind).toBe('outbound');
  });

  it('maps survey-category message to survey entry regardless of direction', () => {
    const out = buildTimeline([], [msg({ sid: 'A3', direction: 'inbound', category: 'survey', body: '7/10 ok' })]);
    expect(out[0].kind).toBe('survey');
  });

  it('maps workout-category message to workout entry', () => {
    const out = buildTimeline([], [msg({ sid: 'A4', direction: 'inbound', category: 'workout', body: '60 min' })]);
    expect(out[0].kind).toBe('workout');
  });

  it('maps rehab-category message to rehab entry', () => {
    const out = buildTimeline([], [msg({ sid: 'A5', direction: 'inbound', category: 'rehab', body: 'mobility' })]);
    expect(out[0].kind).toBe('rehab');
  });

  it('interleaves activity_logs and messages by ts desc', () => {
    const logs = [
      log({ id: 1, logged_at: '2026-04-20T08:00:00Z', description: 'a' }),
      log({ id: 2, logged_at: '2026-04-20T12:00:00Z', description: 'b' }),
    ];
    const msgs = [
      msg({ sid: 'X', date_sent: '2026-04-20T10:00:00Z' }),
      msg({ sid: 'Y', date_sent: '2026-04-20T14:00:00Z' }),
    ];
    const out = buildTimeline(logs, msgs);
    expect(out.map((e) => e.id)).toEqual(['msg:Y', 'log:2', 'msg:X', 'log:1']);
  });

  it('skips hidden activity_logs', () => {
    const out = buildTimeline([log({ id: 9, hidden: true })], []);
    expect(out).toEqual([]);
  });

  it('exposes original direction on message entries via meta', () => {
    const out = buildTimeline([], [msg({ sid: 'D1', direction: 'outbound', category: 'survey' })]);
    expect(out[0].meta).toMatchObject({ direction: 'outbound' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (module not found)**

Run: `cd apps/web && bun x vitest run src/lib/timeline.test.ts`
Expected: FAIL with `Cannot find module './timeline'` or similar.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/timeline.ts`:

```ts
// Merges activity_logs + twilio_messages into a single chronological feed
// for the unified athlete timeline. Pure logic; no side effects.

import type { ActivityLog, TwilioMessage } from '@reflect-live/shared';

export type TimelineKind =
  | 'workout'
  | 'rehab'
  | 'survey'
  | 'inbound'
  | 'outbound';

export interface TimelineEntry {
  /** Stable id: 'log:{id}' for activity_logs, 'msg:{sid}' for twilio_messages. */
  id: string;
  kind: TimelineKind;
  /** ISO timestamp the entry should be sorted by. */
  ts: string;
  /** Human-readable body — log description or message body. */
  body: string;
  /** Per-source extras for the row renderer. */
  meta:
    | { source: 'log'; logId: number }
    | { source: 'msg'; sid: string; direction: string };
}

function logToEntry(l: ActivityLog): TimelineEntry {
  return {
    id: `log:${l.id}`,
    kind: l.kind === 'rehab' ? 'rehab' : 'workout',
    ts: l.logged_at,
    body: l.description ?? '',
    meta: { source: 'log', logId: l.id },
  };
}

function msgToEntry(m: TwilioMessage): TimelineEntry {
  // Category drives the kind so workouts/rehab/surveys reported via SMS
  // render with the same pill as the equivalent activity_log row.
  // Plain chat falls back to direction (inbound vs outbound).
  let kind: TimelineKind;
  if (m.category === 'survey') kind = 'survey';
  else if (m.category === 'workout') kind = 'workout';
  else if (m.category === 'rehab') kind = 'rehab';
  else kind = m.direction === 'outbound' ? 'outbound' : 'inbound';

  return {
    id: `msg:${m.sid}`,
    kind,
    ts: m.date_sent,
    body: m.body ?? '',
    meta: { source: 'msg', sid: m.sid, direction: m.direction },
  };
}

export function buildTimeline(
  logs: ActivityLog[],
  msgs: TwilioMessage[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const l of logs) {
    if (l.hidden) continue;
    entries.push(logToEntry(l));
  }
  for (const m of msgs) {
    entries.push(msgToEntry(m));
  }
  entries.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return entries;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bun x vitest run src/lib/timeline.test.ts`
Expected: 11 passing.

- [ ] **Step 5: Type-check the project**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/timeline.ts apps/web/src/lib/timeline.test.ts
git commit -m "feat(timeline): buildTimeline merges activity_logs+messages by ts (TDD)"
```

---

## Task 4: `<UnifiedTimeline>` component

**Files:**
- Create: `apps/web/src/components/v3/unified-timeline.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/v3/unified-timeline.tsx`:

```tsx
'use client';

// Merged activity_logs + twilio_messages feed with a chip filter row.
// Default chip is 'all' — interleaved by timestamp desc.

import { useMemo, useState } from 'react';
import { Pill } from '@/components/v3/pill';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type Period, periodLabel } from '@/lib/period';
import {
  buildTimeline,
  type TimelineEntry,
  type TimelineKind,
} from '@/lib/timeline';
import type { ActivityLog, TwilioMessage } from '@reflect-live/shared';
import { prettyDateTime, relativeTime } from '@/lib/format';

type Chip = 'all' | 'activity' | 'messages' | 'survey';

interface Props {
  logs: ActivityLog[];
  messages: TwilioMessage[];
  period: Period;
}

const CHIPS: Array<{ key: Chip; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'activity', label: 'Activity' },
  { key: 'messages', label: 'Messages' },
  { key: 'survey', label: 'Survey' },
];

const KIND_TONE: Record<TimelineKind, 'green' | 'amber' | 'blue' | 'mute'> = {
  workout: 'green',
  rehab: 'amber',
  survey: 'blue',
  inbound: 'mute',
  outbound: 'mute',
};

const KIND_LABEL: Record<TimelineKind, string> = {
  workout: 'workout',
  rehab: 'rehab',
  survey: 'survey',
  inbound: 'inbound',
  outbound: 'outbound',
};

function entryMatchesChip(e: TimelineEntry, chip: Chip): boolean {
  if (chip === 'all') return true;
  if (chip === 'activity') return e.kind === 'workout' || e.kind === 'rehab';
  if (chip === 'messages') return e.kind === 'inbound' || e.kind === 'outbound';
  if (chip === 'survey') return e.kind === 'survey';
  return true;
}

export function UnifiedTimeline({ logs, messages, period }: Props) {
  const [chip, setChip] = useState<Chip>('all');

  const all = useMemo(() => buildTimeline(logs, messages), [logs, messages]);
  const filtered = useMemo(
    () => all.filter((e) => entryMatchesChip(e, chip)),
    [all, chip],
  );

  return (
    <section
      className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b flex-wrap"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-bold text-[color:var(--ink)]">Activity &amp; messages</h2>
          <span className="text-[12px] text-[color:var(--ink-mute)]">
            {filtered.length} {periodLabel(period).toLowerCase()}
          </span>
        </div>
        <div
          className="inline-flex rounded-md border overflow-hidden"
          style={{ borderColor: 'var(--border)' }}
          role="radiogroup"
          aria-label="Filter timeline"
        >
          {CHIPS.map((c) => {
            const active = chip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChip(c.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                  active
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--ink-mute)]">— no entries in this view —</p>
        </div>
      ) : (
        <ScrollArea className="h-[440px]">
          <ul>
            {filtered.map((e) => (
              <li
                key={e.id}
                className="border-b px-5 py-3 last:border-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-[88px] text-right">
                    <div
                      className="mono text-[11px] tabular text-[color:var(--ink-mute)]"
                      title={prettyDateTime(e.ts)}
                    >
                      {relativeTime(e.ts)}
                    </div>
                  </div>
                  <div className="shrink-0 w-px self-stretch bg-[color:var(--border)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Pill>
                    </div>
                    {e.body && (
                      <div className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--ink-soft)]">
                        {e.body}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/v3/unified-timeline.tsx
git commit -m "feat(v3): UnifiedTimeline — merged activity+messages with chip filter"
```

---

## Task 5: `<HeatmapTabs>` component

**Files:**
- Create: `apps/web/src/components/v3/heatmap-tabs.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/v3/heatmap-tabs.tsx`:

```tsx
'use client';

// Three-mode body-map card: Injury / Activity / Rehab.
// Wraps the existing <BodyHeatmap> and swaps `counts` per tab. The side
// list shows the top items for the active tab.

import { useState } from 'react';
import { BodyHeatmap } from '@/components/v3/body-heatmap';
import { Pill } from '@/components/v3/pill';
import { regionLabel } from '@/lib/injury-aliases';
import type { Gender } from '@reflect-live/shared';

export type HeatmapTab = 'injury' | 'activity' | 'rehab';

export interface InjurySideRow {
  id: number;
  regions: string[];
  severity: number | null;
  description: string;
  reportedAt: string;
}

interface Props {
  injuryCounts: Record<string, number>;
  activityCounts: Record<string, number>;
  rehabCounts: Record<string, number>;
  injuryRows: InjurySideRow[];
  gender: Gender;
}

const TABS: Array<{ key: HeatmapTab; label: string }> = [
  { key: 'injury', label: 'Injury' },
  { key: 'activity', label: 'Activity' },
  { key: 'rehab', label: 'Rehab' },
];

function topRegions(counts: Record<string, number>, limit = 8): Array<[string, number]> {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export function HeatmapTabs({
  injuryCounts,
  activityCounts,
  rehabCounts,
  injuryRows,
  gender,
}: Props) {
  const [tab, setTab] = useState<HeatmapTab>('injury');

  const counts =
    tab === 'injury' ? injuryCounts : tab === 'activity' ? activityCounts : rehabCounts;

  return (
    <section
      className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b flex-wrap"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-bold text-[color:var(--ink)]">Body map</h2>
        <div
          className="inline-flex rounded-md border overflow-hidden"
          style={{ borderColor: 'var(--border)' }}
          role="radiogroup"
          aria-label="Heatmap mode"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTab(t.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                  active
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="grid gap-6 px-6 py-6 md:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div>
          <BodyHeatmap
            counts={counts}
            gender={gender}
            scale={0.6}
            className="w-full"
          />
        </div>
        <div className="min-w-0">
          {tab === 'injury' ? (
            injuryRows.length === 0 ? (
              <p className="text-[13px] text-[color:var(--ink-mute)] py-8 text-center">
                No active injuries — clean bill of health.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {injuryRows.slice(0, 10).map((r) => (
                  <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {r.regions.map((reg) => (
                        <Pill key={reg} tone="mute">{regionLabel(reg)}</Pill>
                      ))}
                      {r.severity != null && (
                        <Pill tone={r.severity >= 4 ? 'red' : r.severity >= 3 ? 'amber' : 'green'}>
                          sev {r.severity}
                        </Pill>
                      )}
                    </div>
                    <p className="text-[13px] text-[color:var(--ink-soft)]">{r.description}</p>
                  </li>
                ))}
              </ul>
            )
          ) : (
            (() => {
              const top = topRegions(counts);
              if (top.length === 0) {
                return (
                  <p className="text-[13px] text-[color:var(--ink-mute)] py-8 text-center">
                    No {tab} hits in this period.
                  </p>
                );
              }
              return (
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {top.map(([region, n]) => (
                    <li key={region} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between">
                      <span className="text-[13px] text-[color:var(--ink)]">{regionLabel(region)}</span>
                      <span className="mono tabular text-[12px] text-[color:var(--ink-mute)]">
                        {n} session{n === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/v3/heatmap-tabs.tsx
git commit -m "feat(v3): HeatmapTabs — Injury/Activity/Rehab body-map card"
```

---

## Task 6: `<AthleteHero>` component

**Files:**
- Create: `apps/web/src/components/v3/athlete-hero.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/v3/athlete-hero.tsx`:

```tsx
'use client';

// Hero block for the unified athlete page. Readiness-led, AI sentence
// directly underneath, identity caption, period toggle, inline action row.
// Auto-fetches the AI summary when player or period changes; no
// "Generate" button. The freshness chip + refresh icon expose the cache.

import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Pill } from '@/components/v3/pill';
import { PeriodToggle } from '@/components/v3/period-toggle';
import { ReadinessBar } from '@/components/v3/readiness-bar';
import { type Period, periodKey } from '@/lib/period';
import { prettyPhone, relativeTime } from '@/lib/format';
import type { Player } from '@reflect-live/shared';

interface Derived {
  avgReadiness: number | null;
  responses: number;
  flags: number;
  lastInbound: string | null;
}

interface SummaryResult {
  summary: string;
  generated_by: 'llm' | 'rules';
  confidence: 'low' | 'medium' | 'high';
  from_cache?: boolean;
  cached_at?: string;
  error?: string;
}

export type ActionVerb =
  | 'text'
  | 'log_session'
  | 'mark_injury_resolved'
  | 'self_report'
  | 'log_workout'
  | 'report_injury';

interface Props {
  player: Player;
  derived: Derived;
  period: Period;
  onPeriodChange: (p: Period) => void;
  viewerIsSelf: boolean;
  showPhone: boolean;
  onAction: (verb: ActionVerb) => void;
}

function statusFor(hours: number | null): { tone: 'green' | 'amber' | 'mute'; text: string } {
  if (hours == null) return { tone: 'mute', text: 'quiet' };
  if (hours < 1) return { tone: 'green', text: 'live' };
  if (hours < 24) return { tone: 'green', text: 'on wire' };
  if (hours < 72) return { tone: 'amber', text: 'watch' };
  return { tone: 'mute', text: 'quiet' };
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export function AthleteHero({
  player,
  derived,
  period,
  onPeriodChange,
  viewerIsSelf,
  showPhone,
  onAction,
}: Props) {
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchSummary(opts: { force?: boolean } = {}) {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ days: periodKey(period) });
      if (opts.force) qs.set('force', '1');
      const r = await fetch(`/api/players/${player.id}/summary?${qs}`, { method: 'POST' });
      if (!r.ok) {
        setErr(`Request failed (${r.status}).`);
        return;
      }
      const j = (await r.json()) as SummaryResult;
      setSummary(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, period]);

  const status = statusFor(hoursSince(derived.lastInbound));
  const cachedAge = summary?.cached_at ? relativeTime(summary.cached_at) : null;

  const actions: Array<{ verb: ActionVerb; label: string }> = viewerIsSelf
    ? [
        { verb: 'self_report', label: 'Self-report' },
        { verb: 'log_workout', label: 'Log workout' },
        { verb: 'report_injury', label: 'Report injury' },
      ]
    : [
        { verb: 'text', label: 'Text' },
        { verb: 'log_session', label: 'Log session' },
        { verb: 'mark_injury_resolved', label: 'Mark injury resolved' },
      ];

  return (
    <section className="reveal reveal-1 grid gap-6 lg:grid-cols-12">
      {/* Readiness + AI sentence (dominant) */}
      <div
        className="rounded-2xl bg-[color:var(--card)] border p-6 lg:col-span-8 flex flex-col gap-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <ReadinessBar
            value={derived.avgReadiness}
            responses={derived.responses}
            flagged={derived.flags}
            size="md"
          />
          <PeriodToggle value={period} onChange={onPeriodChange} />
        </div>

        <div className="flex items-start gap-3">
          <Sparkles className="size-4 mt-1 shrink-0 text-[color:var(--blue)]" />
          <div className="min-w-0 flex-1">
            {loading && !summary && (
              <p className="text-[13px] text-[color:var(--ink-mute)]">— generating —</p>
            )}
            {err && !summary && (
              <p className="text-[13px]" style={{ color: 'var(--red)' }}>{err}</p>
            )}
            {summary && (
              <>
                <p className="text-[14px] leading-relaxed text-[color:var(--ink)]">
                  {summary.summary}
                </p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Pill tone={summary.generated_by === 'llm' ? 'blue' : 'mute'}>
                    {summary.generated_by === 'llm' ? 'LLM' : 'Rules'}
                  </Pill>
                  {summary.error && <Pill tone="amber">Fallback</Pill>}
                  {cachedAge && (
                    <span className="text-[11.5px] text-[color:var(--ink-mute)]">
                      Generated {cachedAge}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchSummary({ force: true })}
                    disabled={loading}
                    aria-label="Regenerate summary"
                    className="ml-1 inline-flex items-center justify-center rounded-md border p-1 text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] disabled:opacity-50"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Inline action row */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {actions.map((a) => (
            <button
              key={a.verb}
              type="button"
              onClick={() => onAction(a.verb)}
              className="rounded-md border px-3 py-1.5 text-[12px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] hover:border-[color:var(--blue)] transition"
              style={{ borderColor: 'var(--border)' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Identity caption */}
      <div
        className="rounded-2xl bg-[color:var(--card)] border p-6 lg:col-span-4 flex flex-col gap-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="grid size-12 place-items-center rounded-md border bg-[color:var(--paper)] text-[14px] font-bold"
            style={{ borderColor: 'var(--border)' }}
          >
            {player.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[18px] font-bold text-[color:var(--ink)] truncate">{player.name}</div>
            <div className="text-[12px] text-[color:var(--ink-mute)]">
              {player.group ?? 'No group'} · ID {String(player.id).padStart(4, '0')}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[color:var(--ink-mute)]">Status</span>
          <Pill tone={status.tone}>{status.text}</Pill>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[color:var(--ink-mute)]">Last on wire</span>
          <span className="mono tabular text-[color:var(--ink-soft)]">
            {derived.lastInbound ? relativeTime(derived.lastInbound) : '—'}
          </span>
        </div>
        {showPhone && (
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[color:var(--ink-mute)]">Phone</span>
            <span className="mono tabular text-[color:var(--ink-soft)]">{prettyPhone(player.phone_e164)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/v3/athlete-hero.tsx
git commit -m "feat(v3): AthleteHero — readiness-led hero with auto-fetched AI sentence + action row"
```

---

## Task 7: refit `/dashboard/players/[id]` page

**Files:**
- Modify: `apps/web/src/app/dashboard/players/[id]/page.tsx`

- [ ] **Step 1: Replace the page contents**

Overwrite `apps/web/src/app/dashboard/players/[id]/page.tsx` with:

```tsx
'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, useDashboard } from '@/components/dashboard-shell';
import { AthleteHero, type ActionVerb } from '@/components/v3/athlete-hero';
import { HeatmapTabs, type InjurySideRow } from '@/components/v3/heatmap-tabs';
import { UnifiedTimeline } from '@/components/v3/unified-timeline';
import { type Period, periodSinceIso } from '@/lib/period';
import { parseInjuryRegions } from '@/lib/injury-aliases';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, TwilioMessage, ActivityLog } from '@reflect-live/shared';

interface InjuryRow {
  id: number;
  regions: string[];
  severity: number | null;
  description: string;
  reported_at: string;
  resolved_at: string | null;
}

function countRegions(rows: ActivityLog[], kind: 'workout' | 'rehab'): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r.kind !== kind) continue;
    for (const region of parseInjuryRegions(r.description)) {
      if (region === 'other') continue;
      counts[region] = (counts[region] ?? 0) + 1;
    }
  }
  return counts;
}

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const playerId = Number(id);
  const sb = useSupabase();
  const router = useRouter();
  const { team, prefs } = useDashboard();
  const [player, setPlayer] = useState<Player | null>(null);
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [injuries, setInjuries] = useState<InjuryRow[]>([]);
  const [period, setPeriod] = useState<Period>(30);

  useEffect(() => {
    (async () => {
      const since = periodSinceIso(period);

      const msgQ = sb
        .from('twilio_messages')
        .select('*')
        .eq('player_id', playerId)
        .order('date_sent', { ascending: false })
        .limit(200);
      const logQ = sb
        .from('activity_logs')
        .select('*')
        .eq('player_id', playerId)
        .order('logged_at', { ascending: false })
        .limit(200);
      const injQ = sb
        .from('injury_reports')
        .select('id,regions,severity,description,reported_at,resolved_at')
        .eq('player_id', playerId)
        .order('reported_at', { ascending: false })
        .limit(200);

      const [{ data: p }, { data: m }, { data: l }, { data: inj }] = await Promise.all([
        sb.from('players').select('*').eq('id', playerId).single(),
        since ? msgQ.gte('date_sent', since) : msgQ,
        since ? logQ.gte('logged_at', since) : logQ,
        since ? injQ.gte('reported_at', since) : injQ,
      ]);
      setPlayer(p as Player);
      setMsgs((m ?? []) as TwilioMessage[]);
      setLogs((l ?? []) as ActivityLog[]);
      setInjuries((inj ?? []) as InjuryRow[]);
    })();
  }, [sb, playerId, period]);

  const injuryCounts = useMemo<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    for (const r of injuries) {
      if (r.resolved_at) continue;
      for (const region of r.regions) c[region] = (c[region] ?? 0) + 1;
    }
    return c;
  }, [injuries]);

  const activityCounts = useMemo(() => countRegions(logs, 'workout'), [logs]);
  const rehabCounts = useMemo(() => countRegions(logs, 'rehab'), [logs]);

  const activeInjuries = injuries.filter((r) => !r.resolved_at);
  const injurySideRows: InjurySideRow[] = activeInjuries.map((r) => ({
    id: r.id,
    regions: r.regions,
    severity: r.severity,
    description: r.description,
    reportedAt: r.reported_at,
  }));

  const derived = useMemo(() => {
    const surveyReadings = msgs
      .filter((m) => m.category === 'survey' && m.body)
      .map((m) => {
        const match = /^(\d{1,2})/.exec(m.body!.trim());
        return match ? Number(match[1]) : null;
      })
      .filter((n): n is number => n !== null && n >= 1 && n <= 10);
    const avgReadiness = surveyReadings.length
      ? Math.round((surveyReadings.reduce((a, b) => a + b, 0) / surveyReadings.length) * 10) / 10
      : null;
    const lastInbound = msgs.find((m) => m.direction === 'inbound')?.date_sent ?? null;
    const flags = surveyReadings.filter((n) => n <= 4).length;
    return { avgReadiness, responses: surveyReadings.length, flags, lastInbound };
  }, [msgs]);

  if (!player) {
    return (
      <>
        <PageHeader eyebrow="Athlete" title="Loading…" />
        <main className="flex flex-1 p-6">
          <p className="text-[13px] text-[color:var(--ink-mute)]">— loading athlete —</p>
        </main>
      </>
    );
  }

  // viewerIsSelf: the logged-in user IS this athlete (own dashboard).
  // Platform admins always see the coach affordances even when impersonating.
  const viewerIsSelf =
    !prefs.is_platform_admin &&
    prefs.impersonate_player_id === player.id;
  // Phone is always visible: when viewer is the athlete it's their own
  // number; when viewer is a coach/captain/admin they have legit access.
  const showPhone = true;

  function onAction(verb: ActionVerb) {
    switch (verb) {
      case 'text':
        if (player) window.location.href = `sms:${player.phone_e164}`;
        return;
      case 'log_session':
        router.push('/dashboard/sessions');
        return;
      case 'mark_injury_resolved':
        router.push('/dashboard/heatmap');
        return;
      case 'self_report':
      case 'log_workout':
      case 'report_injury':
        // TODO route — implementation lands in D3 follow-up.
        alert(`Coming soon: ${verb.replace('_', ' ')}`);
        return;
    }
  }

  return (
    <>
      <PageHeader eyebrow="Athlete" title={player.name} />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        <AthleteHero
          player={player}
          derived={derived}
          period={period}
          onPeriodChange={setPeriod}
          viewerIsSelf={viewerIsSelf}
          showPhone={showPhone}
          onAction={onAction}
        />
        <HeatmapTabs
          injuryCounts={injuryCounts}
          activityCounts={activityCounts}
          rehabCounts={rehabCounts}
          injuryRows={injurySideRows}
          gender={(player.gender ?? team.default_gender ?? 'male')}
        />
        <UnifiedTimeline logs={logs} messages={msgs} period={period} />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Run dev server and click through**

Run: `bun run dev:web` from the repo root, then in a browser:

- Visit `/dashboard/players/<known-player-id>` as coach.
- Verify hero renders readiness number, AI sentence (auto-fetched), period toggle, identity caption, three coach action buttons.
- Click each heatmap tab (Injury / Activity / Rehab); confirm silhouette swaps and side list reflects each tab.
- Switch period to 7d / 14d / All; confirm the AI sentence refetches and timeline counts update.
- Confirm the timeline shows merged entries; click each chip to filter.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/players/[id]/page.tsx
git commit -m "feat(C1): rebuild player detail page from new v3 components"
```

---

## Task 8: `/dashboard/athlete` redirect to canonical URL

**Files:**
- Modify: `apps/web/src/app/dashboard/athlete/page.tsx`

- [ ] **Step 1: Read the current file to understand the existing picker**

Run: `cd apps/web && head -50 src/app/dashboard/athlete/page.tsx`

You should see the current page reads `prefs.impersonate_player_id` and renders either the player view or the picker. The picker is for admins without an impersonation set; we keep that path intact.

- [ ] **Step 2: Add the redirect-to-canonical at the top of the component**

In `apps/web/src/app/dashboard/athlete/page.tsx`, immediately after the existing `useDashboard()` call inside the page component, add a `useEffect` that redirects when `prefs.impersonate_player_id` is set:

```tsx
import { useRouter } from 'next/navigation';
// ...
export default function AthleteHome() {
  const { prefs, team, refresh } = useDashboard();
  const router = useRouter();

  // Canonical URL for an athlete viewing their own data is
  // /dashboard/players/[their-player-id]. Redirect there as soon as we
  // know which player they are. Admins without an impersonation set fall
  // through to the picker below.
  useEffect(() => {
    if (prefs.impersonate_player_id) {
      router.replace(`/dashboard/players/${prefs.impersonate_player_id}`);
    }
  }, [prefs.impersonate_player_id, router]);

  // ...rest of file unchanged
}
```

The existing `useEffect` and `setAthlete` flows still apply; they only run for the picker path. Keep the rest of the file as-is.

- [ ] **Step 3: Type-check**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Click-through smoke test**

With `bun run dev:web` running:

- As an athlete (or as an admin with `impersonate_player_id` set), visit `/dashboard/athlete`. You should be redirected immediately to `/dashboard/players/<their-id>`.
- As an admin with no impersonation set, visit `/dashboard/athlete`. You should still see the simulator picker. Picking an athlete sets `impersonate_player_id` and the next visit redirects to the canonical URL.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/athlete/page.tsx
git commit -m "feat(athlete): redirect to /dashboard/players/[id] when impersonate set"
```

---

## Task 9: retire `<PlayerSummaryCard>`

**Files:**
- Delete: `apps/web/src/components/v3/player-summary-card.tsx`

- [ ] **Step 1: Confirm no remaining imports**

Run: `cd apps/web && grep -rn "PlayerSummaryCard\|player-summary-card" src --include="*.ts" --include="*.tsx"`
Expected: no matches (Task 7 removed the only reference).

- [ ] **Step 2: Delete the file via Trash**

Run: `mv apps/web/src/components/v3/player-summary-card.tsx ~/.Trash/`

(Recoverable per the project's `mv-to-Trash` convention.)

- [ ] **Step 3: Type-check**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git rm apps/web/src/components/v3/player-summary-card.tsx
git commit -m "chore(v3): retire PlayerSummaryCard — folded into AthleteHero"
```

---

## Task 10: final verification + push

- [ ] **Step 1: Full type-check**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Run all vitest pure-logic tests**

Run: `cd apps/web && bun x vitest run src/lib`
Expected: previously-passing tests still pass + the 11 new `timeline.test.ts` cases pass. No regressions.

- [ ] **Step 3: Push**

```bash
git push
```

Expected: Vercel auto-deploys; visit the deployed URL and re-do Task 7 step 3's click-through against production.
