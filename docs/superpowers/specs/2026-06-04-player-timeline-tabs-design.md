# Player-page timeline restructure: three purpose-clear tabs

**Date:** 2026-06-04
**Status:** Design — pending implementation
**Related:** Builds on `2026-06-04-self-report-deletion-design.md` (the delete backend + trash icon). This restructure folds that delete affordance into a redesigned timeline; the two ship together as one release.

## Problem

The player-detail page's "Activity & messages" box is a single merged feed with five chips (Important / All / Activity / Messages / Survey). It reads as a catch-all: competition-scoring inputs, readiness surveys, and plain chat all blur together, and the coach can't quickly answer "what did this athlete log toward the competition?" The five chips overlap (Important and All are meta-views, not categories) and the Activity view collapses swim/lift into a generic "workout" label that hides the per-kind point values the competition actually scores on.

## Goals

- Replace the 5-chip merged feed with **3 fixed, purpose-clear tabs**: Competition inputs · Surveys · Messages.
- Competition inputs show the **real activity kind** (swim/lift/workout/rehab) with its **point value** from the active competition's scoring map.
- **Dynamic default tab** that adapts per team/player to the highest-signal non-empty category.
- Fold the already-built delete affordance into the Competition inputs and Surveys tabs.
- No backend changes beyond what the self-report-deletion spec already delivered.

## Non-goals

- No delete on the Messages tab (plain chat has no delete endpoint; out of scope).
- No new backend endpoints, schema changes, or migrations beyond migration 0034 (already written).
- No change to the region-filter (body-heatmap) or period-selector behavior.
- No per-team configuration UI for the default tab — it's data-driven.

## Architecture

All changes are confined to two files:
- `apps/web/src/components/v3/unified-timeline.tsx` — the tab restructure.
- `apps/web/src/lib/timeline.ts` — carry the raw activity kind on each entry.

The player page (`apps/web/src/app/dashboard/players/[id]/page.tsx`) needs one small addition: pass the active competition's `scoring` map (already loaded for the leaderboard/standing card) plus a `hasActiveCompetition` flag into `UnifiedTimeline` so it can render point values and pick the default tab.

## Data model — TimelineEntry change

`lib/timeline.ts` currently sets `kind: l.kind === 'rehab' ? 'rehab' : 'workout'` in `logToEntry`, collapsing swim/lift/throw into `workout`. Add a new field that preserves the raw kind:

```ts
export interface TimelineEntry {
  // ...existing fields...
  /** Raw activity_logs.kind for log-sourced entries (swim, lift,
   *  workout, rehab, ...). Null for message-sourced entries. Drives the
   *  Competition inputs tab's per-kind label + point lookup. The coarse
   *  `kind` field stays for tab routing + tone. */
  activityKind: string | null;
}
```

In `logToEntry`, set `activityKind: l.kind` (the raw string). In `msgToEntry`, set `activityKind: null`. The existing coarse `kind` field is unchanged (still `workout` for any non-rehab activity) and continues to drive tab routing and color tone.

## Tabs

Replace the `Chip` type and `CHIPS` array. New tabs:

```ts
type Tab = 'competition' | 'surveys' | 'messages';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'competition', label: 'Competition inputs' },
  { key: 'surveys', label: 'Surveys' },
  { key: 'messages', label: 'Messages' },
];
```

Tab routing (replaces `entryMatchesChip`):

```ts
function entryMatchesTab(e: TimelineEntry, tab: Tab): boolean {
  if (tab === 'competition') return e.kind === 'workout' || e.kind === 'rehab';
  if (tab === 'surveys') return e.kind === 'survey';
  if (tab === 'messages') return e.kind === 'inbound' || e.kind === 'outbound';
  return false;
}
```

Note: `e.kind === 'workout'` catches swim/lift/throw too, since the coarse kind folds them — correct, they're all competition inputs. The per-kind distinction is shown via `activityKind` in the row, not the routing.

**Noise filtering:** the existing `isNoise` / `NOISE_BODY_PATTERNS` logic applies **only within the Messages tab**. Competition inputs and Surveys render every entry (they're inherently signal). Messages defaults to hiding noise (OTP codes, scaffolding, auto-replies) the same way the old "Important" view did.

**Per-tab counts:** each tab header shows the count of matching entries (after noise filtering for Messages), e.g. `Competition inputs · 12`.

**Empty tab:** if the active tab has zero entries, render a muted "Nothing here yet" placeholder inside the card instead of a blank body.

## Dynamic default tab

Computed once on first render (memoized), the default is the highest-signal non-empty tab:

```ts
function defaultTab(opts: {
  hasActiveCompetition: boolean;
  competitionCount: number;
  surveyCount: number;
  messageCount: number;
}): Tab {
  if (opts.hasActiveCompetition && opts.competitionCount > 0) return 'competition';
  if (opts.surveyCount > 0) return 'surveys';
  if (opts.competitionCount > 0) return 'competition';
  if (opts.messageCount > 0) return 'messages';
  return 'competition'; // all empty — land on the primary tab anyway
}
```

`hasActiveCompetition` is derived from the competition data the player page already loads — true if the team has at least one competition whose date range includes today and is not archived. The user can still click any tab; this only sets the initial selection.

## Competition inputs row rendering

Each row shows: `<activityKind> · <points>pt` + the entry body (stripped of protocol prefix) + media thumbnails + trash icon.

Point lookup:

```ts
function pointLabel(activityKind: string | null, scoring: Record<string, number> | undefined): string | null {
  if (!activityKind || !scoring) return null;
  const pts = scoring[activityKind.toLowerCase()];
  if (pts == null) return null;
  return pts === 1 ? '1pt' : `${pts}pts`;
}
```

If `pointLabel` returns null (kind not in any active scoring map), show just the kind label with no point suffix — never a fake "0pts". The `scoring` map is a new optional prop on `UnifiedTimeline`:

```ts
interface Props {
  // ...existing...
  /** kind→points map from the active competition, for the Competition
   *  inputs tab's point labels. Omit if no active competition. */
  scoring?: Record<string, number>;
  /** True if the team has an active competition today — feeds the
   *  dynamic default-tab choice. */
  hasActiveCompetition?: boolean;
}
```

The player page passes the active competition's `scoring` (the same one feeding `CompetitionStandingCard`). If the player is in multiple active competitions, pass the one currently displayed on the page; point labels are a convenience, not a source of truth.

## Delete integration

Reuses the `onDelete` + `canDelete` props already added in the self-report-deletion work. No change to the props' contract.

- **Competition inputs** + **Surveys** tabs: render the trash icon per row (when `onDelete` provided and `canDelete(entry)` is true).
- **Messages** tab: never render the trash icon, regardless of props.

Row-level guard: in the Surveys tab, if an entry is message-sourced (`meta.source === 'msg'`) but has no resolvable `session_id`, hide its trash icon (avoid a dead button). The player page's `onDelete` already alerts on missing session_id as a backstop.

## Files changed

- `apps/web/src/lib/timeline.ts` — add `activityKind` to `TimelineEntry`; set it in `logToEntry` (raw `l.kind`) and `msgToEntry` (null).
- `apps/web/src/components/v3/unified-timeline.tsx` — replace chips with 3 tabs; tab routing; per-tab noise filtering; per-tab counts; dynamic default; competition-row kind+points label; trash icon only on competition + surveys tabs; empty-state placeholder; `scoring` + `hasActiveCompetition` props.
- `apps/web/src/app/dashboard/players/[id]/page.tsx` — pass `scoring` (active competition's scoring map) and `hasActiveCompetition` to `UnifiedTimeline`.

## Testing

- `lib/timeline.ts` — extend existing `timeline.test.ts`: assert `activityKind` is the raw kind for log entries (e.g. a `swim` log yields `activityKind: 'swim'`, coarse `kind: 'workout'`) and null for message entries.
- `pointLabel` and `defaultTab` are pure functions — unit test them directly (1pt vs Npts formatting; null when kind absent; default-tab precedence across the empty/non-empty permutations). Export them from the component module (or a small `timeline-tabs.ts` helper) so they're testable without rendering.
- Component behavior (tab switching, trash visibility per tab) verified manually in the combined end-to-end pass with the delete feature.

## Rollout

This ships folded with the self-report-deletion feature as ONE release:
1. Apply migration `0034` to Supabase (additive, safe for currently-live code).
2. Merge `feat/self-report-deletion` (which also contains this restructure) to main.
3. Vercel deploys. Verify both the delete flow and the new tabs in production.

## Open questions

None. All decisions made:
- Three tabs (Competition inputs / Surveys / Messages).
- Real kind + point value in Competition inputs.
- Dynamic default tab by highest-signal non-empty category, active-competition-aware.
- Tabbed single card (not stacked cards).
- Delete on Competition inputs + Surveys only.

## Risks

- **Multiple active competitions → ambiguous point labels.** If a player is in two active competitions scoring the same kind differently, the point label reflects only the displayed competition. Accepted — labels are a convenience; the leaderboard remains the source of truth.
- **Coarse-kind routing leak.** Because `kind: 'workout'` covers swim/lift/throw, any future activity kind that should NOT be a competition input would still route to that tab. Currently all activity kinds are competition inputs, so no leak today; revisit if a non-scoring activity kind is ever introduced.
