# Player Timeline Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the player-page "Activity & messages" 5-chip catch-all with three purpose-clear tabs — Competition inputs · Surveys · Messages — where competition inputs show the real activity kind + point value, the default tab adapts to the highest-signal category, and delete lives on the competition + surveys tabs.

**Architecture:** Two pure helpers (`pointLabel`, `defaultTab`) extracted to a testable module; `lib/timeline.ts` carries the raw `activity_logs.kind` on each entry; `UnifiedTimeline` swaps its chip filter for three fixed tabs; the player page fetches the team's active competition to feed scoring + the default-tab signal. Folds onto the `feat/self-report-deletion` branch so the delete feature + restructure ship in one release.

**Tech Stack:** Next.js 16 App Router · React · Tailwind v4 · TypeScript strict · Vitest (Bun test runner) · Bun workspaces.

**Spec:** `docs/superpowers/specs/2026-06-04-player-timeline-tabs-design.md`

**Branch:** `feat/self-report-deletion` (already checked out — all delete-feature commits live here; this restructure stacks on top).

**Working directory (all paths relative):**
`/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live/`

---

## File Structure

```
apps/web/src/
├── lib/
│   ├── timeline.ts                    MODIFY: add activityKind to TimelineEntry + set in logToEntry/msgToEntry
│   ├── timeline.test.ts               MODIFY: assert activityKind on log + message entries
│   ├── timeline-tabs.ts               NEW: pure helpers pointLabel() + defaultTab() + Tab type
│   └── timeline-tabs.test.ts          NEW: unit tests for both helpers
├── components/v3/
│   └── unified-timeline.tsx           MODIFY: 3 tabs replace chips; per-tab routing/noise/counts;
│                                              dynamic default; competition kind+points row; trash
│                                              only on competition+surveys; scoring + hasActiveCompetition props
└── app/dashboard/players/[id]/
    └── page.tsx                       MODIFY: fetch active competition → pass scoring + hasActiveCompetition
```

---

## Task 1: Carry the raw activity kind on TimelineEntry

**Files:**
- Modify: `apps/web/src/lib/timeline.ts`
- Modify: `apps/web/src/lib/timeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `apps/web/src/lib/timeline.test.ts`. Add these tests inside the existing top-level `describe` block (or add a new `describe('activityKind', ...)` block at the end of the file, before the final closing brace):

```ts
describe('activityKind', () => {
  it('carries the raw activity_logs.kind for log entries', () => {
    const logs = [
      { id: 1, player_id: 7, team_id: 1, kind: 'swim', description: 'Swim: 30 stations', logged_at: '2026-06-01T12:00:00Z', source_sid: null, media_sids: null },
      { id: 2, player_id: 7, team_id: 1, kind: 'rehab', description: 'Rehab: foam roll', logged_at: '2026-06-01T13:00:00Z', source_sid: null, media_sids: null },
    ] as unknown as Parameters<typeof buildTimeline>[0];
    const entries = buildTimeline(logs, []);
    const swim = entries.find((e) => e.meta.source === 'log' && e.meta.logId === 1)!;
    const rehab = entries.find((e) => e.meta.source === 'log' && e.meta.logId === 2)!;
    // Raw kind preserved...
    expect(swim.activityKind).toBe('swim');
    expect(rehab.activityKind).toBe('rehab');
    // ...while the coarse kind still folds swim into 'workout'.
    expect(swim.kind).toBe('workout');
    expect(rehab.kind).toBe('rehab');
  });

  it('sets activityKind null for message entries', () => {
    const msgs = [
      { sid: 'SM1', direction: 'inbound', from_number: '+1', to_number: null, body: 'hi coach', status: 'received', category: 'chat', date_sent: '2026-06-01T12:00:00Z', player_id: 7, team_id: 1 },
    ] as unknown as Parameters<typeof buildTimeline>[1];
    const entries = buildTimeline([], msgs);
    expect(entries[0].activityKind).toBeNull();
  });
});
```

Note: `buildTimeline` is already imported at the top of `timeline.test.ts` (it's the file's subject). If the existing import doesn't include it, add it: `import { buildTimeline } from './timeline';`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live" && bun test apps/web/src/lib/timeline.test.ts 2>&1 | tail -15
```

Expected: the two new tests FAIL — `activityKind` is `undefined`, not `'swim'`/`'rehab'`/`null`.

- [ ] **Step 3: Add the field to the interface**

In `apps/web/src/lib/timeline.ts`, find `export interface TimelineEntry {` and add this field (place it right after the `kind` field for logical grouping):

```ts
  /** Raw activity_logs.kind for log-sourced entries (swim, lift,
   *  workout, rehab, ...). Null for message-sourced entries. Drives the
   *  Competition inputs tab's per-kind label + point lookup. The coarse
   *  `kind` field stays for tab routing + tone. */
  activityKind: string | null;
```

- [ ] **Step 4: Set the field in logToEntry**

In `apps/web/src/lib/timeline.ts`, find `function logToEntry(l: ActivityLog): TimelineEntry {`. In its returned object, add:

```ts
    activityKind: l.kind,
```

(Place it next to the existing `kind:` property.)

- [ ] **Step 5: Set the field in msgToEntry**

In the same file, find `function msgToEntry(m: TwilioMessage): TimelineEntry {`. In its returned object, add:

```ts
    activityKind: null,
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
bun test apps/web/src/lib/timeline.test.ts 2>&1 | tail -15
```

Expected: all tests pass, including the two new ones.

- [ ] **Step 7: Verify typecheck + full suite**

```bash
bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -5
bun test apps/web 2>&1 | tail -5
```

Expected: typecheck clean; full suite green (was 115, now 117 with the two new tests).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/timeline.ts apps/web/src/lib/timeline.test.ts
git commit -m "feat(timeline): carry raw activityKind on TimelineEntry

Log entries now expose the real activity_logs.kind (swim, lift, ...)
alongside the coarse workout/rehab kind used for routing+tone. Message
entries get activityKind=null. Lets the Competition inputs tab show the
true kind + its point value instead of folding everything into workout."
```

---

## Task 2: Pure helpers — pointLabel + defaultTab + Tab type

**Files:**
- Create: `apps/web/src/lib/timeline-tabs.ts`
- Create: `apps/web/src/lib/timeline-tabs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/timeline-tabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pointLabel, defaultTab } from './timeline-tabs';

describe('pointLabel', () => {
  const scoring = { swim: 2, workout: 1, rehab: 0.6 };

  it('formats a multi-point kind as "Npts"', () => {
    expect(pointLabel('swim', scoring)).toBe('2pts');
  });

  it('formats a one-point kind as "1pt" (singular)', () => {
    expect(pointLabel('workout', scoring)).toBe('1pt');
  });

  it('formats a fractional kind', () => {
    expect(pointLabel('rehab', scoring)).toBe('0.6pts');
  });

  it('is case-insensitive on the kind', () => {
    expect(pointLabel('SWIM', scoring)).toBe('2pts');
  });

  it('returns null when the kind is not in the scoring map', () => {
    expect(pointLabel('yoga', scoring)).toBeNull();
  });

  it('returns null when scoring is undefined', () => {
    expect(pointLabel('swim', undefined)).toBeNull();
  });

  it('returns null when activityKind is null', () => {
    expect(pointLabel(null, scoring)).toBeNull();
  });
});

describe('defaultTab', () => {
  it('picks competition when active competition has entries', () => {
    expect(defaultTab({ hasActiveCompetition: true, competitionCount: 3, surveyCount: 5, messageCount: 9 })).toBe('competition');
  });

  it('falls to surveys when no active competition but surveys exist', () => {
    expect(defaultTab({ hasActiveCompetition: false, competitionCount: 4, surveyCount: 2, messageCount: 9 })).toBe('surveys');
  });

  it('falls to competition when active competition is over but past inputs exist and no surveys', () => {
    expect(defaultTab({ hasActiveCompetition: false, competitionCount: 4, surveyCount: 0, messageCount: 9 })).toBe('competition');
  });

  it('falls to messages when only messages have entries', () => {
    expect(defaultTab({ hasActiveCompetition: false, competitionCount: 0, surveyCount: 0, messageCount: 9 })).toBe('messages');
  });

  it('lands on competition when everything is empty', () => {
    expect(defaultTab({ hasActiveCompetition: false, competitionCount: 0, surveyCount: 0, messageCount: 0 })).toBe('competition');
  });

  it('prefers surveys over an active-but-empty competition', () => {
    expect(defaultTab({ hasActiveCompetition: true, competitionCount: 0, surveyCount: 3, messageCount: 0 })).toBe('surveys');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live" && bun test apps/web/src/lib/timeline-tabs.test.ts 2>&1 | tail -10
```

Expected: fails with `Cannot find module './timeline-tabs'`.

- [ ] **Step 3: Write the helper module**

Create `apps/web/src/lib/timeline-tabs.ts`:

```ts
// Pure helpers for the player-page timeline tabs. Kept out of the
// component so they're unit-testable without rendering.

export type Tab = 'competition' | 'surveys' | 'messages';

/** Point-value label for a competition input, e.g. 'swim' + {swim:2} →
 *  '2pts'. Singular '1pt' for exactly one. Null when the kind isn't
 *  scored (or no scoring map / no kind) — callers render just the kind
 *  with no point suffix rather than a misleading '0pts'. */
export function pointLabel(
  activityKind: string | null,
  scoring: Record<string, number> | undefined,
): string | null {
  if (!activityKind || !scoring) return null;
  const pts = scoring[activityKind.toLowerCase()];
  if (pts == null) return null;
  return pts === 1 ? '1pt' : `${pts}pts`;
}

/** Highest-signal non-empty tab to open on. A team mid-competition
 *  lands on scoring inputs; a survey-only team lands on check-ins;
 *  nobody lands on an empty tab. */
export function defaultTab(opts: {
  hasActiveCompetition: boolean;
  competitionCount: number;
  surveyCount: number;
  messageCount: number;
}): Tab {
  if (opts.hasActiveCompetition && opts.competitionCount > 0) return 'competition';
  if (opts.surveyCount > 0) return 'surveys';
  if (opts.competitionCount > 0) return 'competition';
  if (opts.messageCount > 0) return 'messages';
  return 'competition';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test apps/web/src/lib/timeline-tabs.test.ts 2>&1 | tail -10
```

Expected: `13 pass, 0 fail`.

- [ ] **Step 5: Verify full suite + typecheck**

```bash
bun test apps/web 2>&1 | tail -5
bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -5
```

Expected: suite green (now 130: 117 + 13); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/timeline-tabs.ts apps/web/src/lib/timeline-tabs.test.ts
git commit -m "feat(timeline): pure pointLabel + defaultTab helpers + Tab type

pointLabel formats a kind's competition points (1pt / Npts / null when
unscored). defaultTab picks the highest-signal non-empty tab. Extracted
to a standalone module so both are unit-tested without rendering."
```

---

## Task 3: Restructure UnifiedTimeline into three tabs

**Files:**
- Modify: `apps/web/src/components/v3/unified-timeline.tsx`

This is the largest task. The component currently: builds a merged timeline, filters by a 5-value `Chip`, renders a header with chip buttons + a count, an optional region-filter banner, and a scrollable list of rows (each with date, kind pill, optional score pill, paired-question, body, media, and the trash button from the delete feature).

- [ ] **Step 1: Replace the Chip type + CHIPS array with Tab + TABS**

Near the top of the file, find:

```ts
type Chip = 'important' | 'all' | 'activity' | 'messages' | 'survey';
```

Replace with an import of the shared `Tab` type. Add to the imports at the top:

```ts
import { pointLabel, defaultTab, type Tab } from '@/lib/timeline-tabs';
```

Then delete the `type Chip = ...` line entirely.

Find the `CHIPS` array:

```ts
const CHIPS: Array<{ key: Chip; label: string }> = [
  { key: 'important', label: 'Important' },
  { key: 'all', label: 'All' },
  { key: 'activity', label: 'Activity' },
  { key: 'messages', label: 'Messages' },
  { key: 'survey', label: 'Survey' },
];
```

Replace it with:

```ts
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'competition', label: 'Competition inputs' },
  { key: 'surveys', label: 'Surveys' },
  { key: 'messages', label: 'Messages' },
];
```

- [ ] **Step 2: Replace entryMatchesChip with entryMatchesTab + per-tab noise**

Find:

```ts
function entryMatchesChip(e: TimelineEntry, chip: Chip): boolean {
  if (chip === 'important') return !isNoise(e);
  if (chip === 'all') return true;
  if (chip === 'activity') return e.kind === 'workout' || e.kind === 'rehab';
  if (chip === 'messages') return e.kind === 'inbound' || e.kind === 'outbound';
  if (chip === 'survey') return e.kind === 'survey';
  return true;
}
```

Replace with:

```ts
function entryMatchesTab(e: TimelineEntry, tab: Tab): boolean {
  if (tab === 'competition') return e.kind === 'workout' || e.kind === 'rehab';
  if (tab === 'surveys') return e.kind === 'survey';
  if (tab === 'messages') {
    // Messages = plain inbound/outbound chat, with the OTP/scaffolding
    // noise hidden by default (same filter the old 'Important' view used).
    return (e.kind === 'inbound' || e.kind === 'outbound') && !isNoise(e);
  }
  return false;
}
```

- [ ] **Step 3: Update the Props destructure + add new props**

Find the `interface Props {` block. Add these two optional props at the end (before the closing `}`):

```ts
  /** kind→points map from the active competition, for the Competition
   *  inputs tab's point labels. Omit if no active competition. */
  scoring?: Record<string, number>;
  /** True if the team has an active competition today — feeds the
   *  dynamic default-tab choice. */
  hasActiveCompetition?: boolean;
```

Find the component signature `export function UnifiedTimeline({ ... }: Props) {` and add `scoring` and `hasActiveCompetition` to the destructured list.

- [ ] **Step 4: Replace chip state with tab state + dynamic default**

Find:

```ts
  const [chip, setChip] = useState<Chip>('important');
```

Replace with the tab state plus a computed default. Put this AFTER `const all = useMemo(() => buildTimeline(logs, visibleMessages), [logs, visibleMessages]);` (the helpers need `all`). First delete the old `const [chip, setChip]...` line, then add after the `all` memo:

```ts
  // Per-tab entry counts (after noise filtering for messages) drive the
  // header badges and the dynamic default-tab choice.
  const counts = useMemo(() => {
    let competition = 0;
    let surveys = 0;
    let messages = 0;
    for (const e of all) {
      if (e.pairedWithReply) continue; // paired outbound questions render inline
      if (entryMatchesTab(e, 'competition')) competition++;
      else if (entryMatchesTab(e, 'surveys')) surveys++;
      else if (entryMatchesTab(e, 'messages')) messages++;
    }
    return { competition, surveys, messages };
  }, [all]);

  const initialTab = useMemo(
    () =>
      defaultTab({
        hasActiveCompetition: hasActiveCompetition ?? false,
        competitionCount: counts.competition,
        surveyCount: counts.surveys,
        messageCount: counts.messages,
      }),
    // Only the FIRST computed value matters — the user can switch freely
    // after. Recomputing on every count change would yank their tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [tab, setTab] = useState<Tab>(initialTab);
```

- [ ] **Step 5: Update the filtered memo to use the tab**

Find the `filtered` memo. It currently calls `entryMatchesChip(e, chip)`. Change that line to `entryMatchesTab(e, tab)` and update the dependency array from `[all, chip, regionSet]` to `[all, tab, regionSet]`:

```ts
  const filtered = useMemo(
    () =>
      all.filter((e) => {
        if (e.pairedWithReply) return false;
        if (!entryMatchesTab(e, tab)) return false;
        if (regionSet) {
          if (e.regions.length === 0) return false;
          if (!e.regions.some((r) => regionSet.has(r))) return false;
        }
        return true;
      }),
    [all, tab, regionSet],
  );
```

- [ ] **Step 6: Replace the header (title + chip buttons) with tabs**

Find the `<header ...>` block (the one containing `Activity &amp; messages` and the `CHIPS.map(...)`). Replace the whole header's inner content. The new header keeps the same outer `<header>` element + classNames; only the inner `<div>`s change:

```tsx
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b flex-wrap"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-bold text-[color:var(--ink)]">Activity</h2>
        <div
          className="inline-flex rounded-md border overflow-hidden"
          style={{ borderColor: 'var(--border)' }}
          role="radiogroup"
          aria-label="Timeline section"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            const count =
              t.key === 'competition' ? counts.competition
              : t.key === 'surveys' ? counts.surveys
              : counts.messages;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                  active
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]'
                }`}
              >
                {t.label} · {count}
              </button>
            );
          })}
        </div>
      </header>
```

- [ ] **Step 7: Show the real kind + points on competition rows**

Find the row's kind pill:

```tsx
                        <Pill tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Pill>
```

Replace with logic that, on the competition tab, uses the raw `activityKind` and appends the point label:

```tsx
                        {tab === 'competition' && e.activityKind ? (
                          <Pill tone={KIND_TONE[e.kind]}>
                            {e.activityKind}
                            {pointLabel(e.activityKind, scoring) && (
                              <span className="opacity-70"> · {pointLabel(e.activityKind, scoring)}</span>
                            )}
                          </Pill>
                        ) : (
                          <Pill tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Pill>
                        )}
```

- [ ] **Step 8: Restrict the trash icon to competition + surveys tabs**

Find the trash button guard:

```tsx
                    {onDelete && canDelete?.(e) && (
```

Replace with a guard that also requires the active tab to be competition or surveys, AND (for surveys) that a session_id-bearing message can actually be deleted. The simplest correct guard:

```tsx
                    {onDelete && canDelete?.(e) && tab !== 'messages' && (
```

(The messages tab never shows the trash. On the surveys tab, message-sourced rows without a session_id will alert via the parent's onDelete backstop — acceptable; the spec's preferred "hide the dead button" is a nice-to-have we skip to avoid threading session_id into TimelineEntry. The competition tab rows are all log-sourced and always deletable.)

- [ ] **Step 9: Update the empty-state copy**

Find the empty-state block (`filtered.length === 0 ? ( ... )`). Update the fallback message so it reads naturally per tab. Replace:

```tsx
          <p className="text-[13px] text-[color:var(--ink-mute)]">
            {regionSet ? '— no entries match this region in the current view —' : '— no entries in this view —'}
          </p>
```

with:

```tsx
          <p className="text-[13px] text-[color:var(--ink-mute)]">
            {regionSet
              ? '— no entries match this region in the current view —'
              : tab === 'competition' ? '— no competition inputs yet —'
              : tab === 'surveys' ? '— no surveys yet —'
              : '— no messages yet —'}
          </p>
```

- [ ] **Step 10: Remove the now-unused header count + verify no dead refs**

The old header had a `{filtered.length} {periodLabel(period).toLowerCase()}` count next to the title; the new header (Step 6) dropped it in favor of per-tab counts. Confirm `periodLabel` is still used elsewhere in the file — search:

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live" && grep -n "periodLabel\|\bchip\b\|entryMatchesChip\|CHIPS" apps/web/src/components/v3/unified-timeline.tsx
```

Expected: NO matches for `chip`, `entryMatchesChip`, or `CHIPS` (all replaced). If `periodLabel` now has zero matches, remove it from the import line at the top (find `import { type Period, periodLabel } from '@/lib/period';` and change to `import { type Period } from '@/lib/period';`). If `period` itself is now unused as a prop, leave the prop (the parent still passes it) but ensure no dead local references.

- [ ] **Step 11: Verify typecheck + tests**

```bash
bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -15
bun test apps/web 2>&1 | tail -5
```

Expected: typecheck clean; suite green (130).

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/components/v3/unified-timeline.tsx
git commit -m "feat(ui): three-tab timeline — Competition inputs / Surveys / Messages

Replaces the 5-chip catch-all. Competition inputs show the real kind
(swim/lift/workout/rehab) + its point value from the active
competition's scoring map. Messages tab keeps the noise filter; the
other two show everything. Per-tab counts in the header; dynamic
default tab via defaultTab(). Trash icon now only on competition +
surveys tabs (never messages)."
```

---

## Task 4: Feed scoring + hasActiveCompetition from the player page

**Files:**
- Modify: `apps/web/src/app/dashboard/players/[id]/page.tsx`

The player page must load the team's active competition to know (a) the scoring map for point labels and (b) whether a competition is active for the default-tab choice. This mirrors how `CompetitionStandingCard` already does it: fetch `/api/competitions?team_id=N`, filter to active rows.

- [ ] **Step 1: Add state for the active competition's scoring**

Near the other `useState` declarations in the page component, add:

```ts
  const [activeScoring, setActiveScoring] = useState<Record<string, number> | undefined>(undefined);
  const [hasActiveComp, setHasActiveComp] = useState(false);
```

- [ ] **Step 2: Fetch active competitions in an effect**

Add this `useEffect` alongside the page's other effects (it needs `team?.id`). Use the exact active-filter predicate `CompetitionStandingCard` uses (`!archived_at && starts_at <= today && today <= ends_at`):

```ts
  useEffect(() => {
    if (!team?.id) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/competitions?team_id=${team.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { competitions = [] } = (await res.json()) as {
          competitions: Array<{ scoring: Record<string, number> | null; starts_at: string; ends_at: string; archived_at: string | null }>;
        };
        const today = new Date().toISOString().slice(0, 10);
        const active = competitions.filter(
          (c) => !c.archived_at && c.starts_at <= today && today <= c.ends_at,
        );
        if (!alive) return;
        setHasActiveComp(active.length > 0);
        setActiveScoring(active[0]?.scoring ?? undefined);
      } catch {
        // Non-fatal — point labels just won't show; default tab falls back.
      }
    })();
    return () => { alive = false; };
  }, [team?.id]);
```

If `useEffect` is not already imported from `react` on this page, add it (it almost certainly is — the page has other effects).

- [ ] **Step 3: Pass the new props to UnifiedTimeline**

Find the `<UnifiedTimeline ... />` JSX (around line 580). Add the two new props, preserving the existing ones:

```tsx
        <UnifiedTimeline
          logs={logs}
          messages={msgs}
          period={period}
          selectedRegions={selectedRegions}
          onClearRegionFilter={() => setSelectedRegions([])}
          canDelete={canDelete}
          onDelete={onDelete}
          scoring={activeScoring}
          hasActiveCompetition={hasActiveComp}
        />
```

- [ ] **Step 4: Verify typecheck + tests**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live" && bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -10
bun test apps/web 2>&1 | tail -5
```

Expected: typecheck clean; suite green (130).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/players/\[id\]/page.tsx
git commit -m "feat(ui): feed active-competition scoring into the player timeline

Player page fetches /api/competitions, derives the active competition
(same predicate as CompetitionStandingCard), and passes its scoring map
+ a hasActiveCompetition flag to UnifiedTimeline so Competition inputs
rows show point values and the default tab adapts."
```

---

## Task 5: Combined end-to-end verification + ship

This task verifies BOTH the delete feature (from the prior plan) and the tab restructure together, then releases them as one deploy.

- [ ] **Step 1: Apply migration 0034 to Supabase**

The migration is additive and safe for the currently-live code. In the Supabase dashboard → SQL Editor, paste and run the contents of `supabase/migrations/0034_twilio_messages_soft_delete.sql`. Verify:

```sql
select count(*) from twilio_messages where sid like 'web-self-%' and session_id is null;
```

Expected: `0`.

- [ ] **Step 2: Run the dev server and smoke-test the tabs**

```bash
bun run dev:web
```

In a browser, sign in as a coach and open `/dashboard/players/<athlete_id>`. Verify:
- The timeline card shows three tabs: Competition inputs · Surveys · Messages, each with a count.
- It opens on the highest-signal tab (competition if the team has an active competition with inputs).
- Competition inputs rows show the real kind + points (e.g. `swim · 2pts`).
- The Messages tab hides OTP/scaffolding noise.

- [ ] **Step 3: Smoke-test delete on each tab**

- Competition inputs tab: hover a row → trash → confirm → row disappears, and the competition leaderboard count for that athlete drops.
- Surveys tab: hover a self-report row → trash → confirm → the whole session disappears.
- Messages tab: confirm NO trash icon appears.

- [ ] **Step 4: Permission boundary check**

- As a coach on Team A, open an athlete on Team B → no trash icon on any tab.
- As an athlete viewing their own page → trash appears on competition + surveys; viewing another athlete → no trash.

- [ ] **Step 5: Merge to main + deploy**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
git checkout main
git merge --no-ff feat/self-report-deletion -m "merge: self-report + activity-log deletion + 3-tab player timeline"
git push
```

Vercel auto-deploys on push. After deploy, repeat steps 2-4 against production to confirm.

- [ ] **Step 6: Final commit (verification note, optional)**

```bash
echo "Verified 2026-06-04: delete + 3-tab timeline working end-to-end in production." >> IDEAS.md
git add IDEAS.md
git commit -m "verified: deletion + timeline tabs end-to-end" && git push
```

---

## Self-review checklist

- [x] **Spec coverage:** activityKind (Task 1), pointLabel + defaultTab (Task 2), 3 tabs + per-tab routing/noise/counts + dynamic default + real-kind+points row + trash-tab restriction + empty state + props (Task 3), player-page scoring/hasActiveCompetition wiring (Task 4), combined verification + migration + merge (Task 5). All spec sections mapped.
- [x] **Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step shows real code; every command shows expected output.
- [x] **Type consistency:** `Tab` defined once in `timeline-tabs.ts` and imported by the component. `pointLabel`/`defaultTab` signatures match between Task 2 definition and Task 3 usage. `activityKind` field name consistent across Tasks 1 and 3. `scoring` / `hasActiveCompetition` prop names consistent across Tasks 3 and 4.
- [x] **Reused, not rebuilt:** delete props (`onDelete`/`canDelete`), region filter, period selector, media strip, score pills all preserved from the existing component.
