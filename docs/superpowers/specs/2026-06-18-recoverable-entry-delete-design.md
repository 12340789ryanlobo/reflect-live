# Recoverable entry delete — propagation fix + undo + trash view

**Date:** 2026-06-18
**Status:** Design — pending implementation
**Extends:** `2026-06-04-self-report-deletion-design.md` (which shipped soft-delete
via `hidden=true` on `activity_logs` + `twilio_messages`, but listed "No undo /
no Restore button" as an explicit v1 non-goal). This spec is that v2 follow-up.

## Problem

Two distinct issues with deleting an entry from the activity box on the athlete
page (`/dashboard/players/[id]`):

1. **Deletes don't propagate.** `onDelete` removes the row from the timeline's
   local state optimistically and hides it in the DB (`hidden=true`), but never
   triggers a refetch of the other cards on the page. The **Competitions
   standing card** fetches its leaderboard once on mount (keyed only to
   `[teamId, playerId]`) and never re-runs, so a deleted entry keeps showing in
   standings until a full page refresh. The leaderboard math already excludes
   hidden rows (`.eq('hidden', false)` in `scoring.ts`) — it simply isn't re-run.

2. **No way to recover a mistaken delete.** Rows are already soft-deleted, so the
   data to restore is sitting in the DB, but there is no UI to bring it back. The
   current confirm dialog even warns *"You can't undo this from the UI."*

## Goals

- A deleted entry disappears **everywhere** on the athlete page immediately
  (timeline, competitions, and every other derived card/stat), with no manual
  refresh.
- A mistaken delete can be undone **instantly** via an Undo toast.
- A deleted entry can be recovered **later** via a per-athlete "Recently deleted"
  trash section.
- No data-model change: reuse the existing `hidden` columns. Restore = flip
  `hidden` back to `false`, mirroring the delete cascade exactly.

## Non-goals (this version)

- No new migration / no schema change. (`hidden` already exists on both tables.)
- No audit trail (`deleted_by`, `deleted_at`, `restored_by`). Skip until asked.
- No auto-purge / retention policy. Hidden rows persist indefinitely.
- No team-wide trash moderation screen. Trash is per-athlete, on the athlete page.
- No per-answer restore. Self-report restore is whole-session, mirroring delete.

## Part A — Propagation fix ("not shown anywhere")

### Refresh signal

The athlete page already has a `dataTick` counter (bumped by the Log / Injury /
Self-report dialogs to force a refetch). The fix is to **bump it on delete and on
restore too**, and to thread it into every child that derives from entries.

- `apps/web/src/app/dashboard/players/[id]/page.tsx`
  - `onDelete`: after a successful DELETE, `setDataTick((n) => n + 1)`.
  - The Undo / Restore handlers (Parts B & C): same bump after a successful
    restore.
- `apps/web/src/components/v3/competition-standing-card.tsx`
  - Add a `refreshKey` (or `dataTick`) prop; include it in the fetch effect's
    dependency array so standings re-compute on delete/restore.

### Read-path audit ("everywhere")

Confirm each consumer of the entry tables (1) filters `hidden=false` and (2)
re-reads when the refresh signal bumps (or is naturally re-rendered). The prior
spec already swept these for the `hidden` filter; this pass verifies the filter
is present *and* that the consumer reacts to delete on the athlete page:

| File | Role | Check |
|---|---|---|
| `apps/web/src/lib/scoring.ts` (`computeCompetitionLeaderboard`) | Competition standings | Filter present ✓ — wire `refreshKey` into the card that calls it |
| `apps/web/src/lib/timeline.ts` / `components/v3/unified-timeline.tsx` | Activity box | Already optimistic; confirm filter on refetch |
| `apps/web/src/lib/survey-trends.ts` | Survey/score trends | Confirm `hidden=false`; re-read on `dataTick` |
| `apps/web/src/lib/survey-injuries.ts` | Injury extraction | Confirm `hidden=false`; re-read on `dataTick` |
| `apps/web/src/components/live-feed.tsx` | Dashboard live stream | Confirm `hidden=false` (not athlete-page, but part of "anywhere") |

Any card on the athlete page that reads these and is **not** keyed to the refresh
signal gets the same `refreshKey` treatment as the competition card. The
implementation step enumerates the page's actual children rather than assuming
only Competitions is affected.

## Part B — Undo toast (instant recovery)

### Toast infra

No toast library exists today (delete uses `confirm()` + `alert()`). Add
**`sonner`**:

- `bun add sonner` in `apps/web`.
- Mount one `<Toaster />` in the dashboard layout
  (`apps/web/src/app/dashboard/layout.tsx` or the nearest shared layout).

### Flow

Replace the blocking `confirm()` in `onDelete` with optimistic-delete-then-toast:

1. Optimistically remove the entry from local state (as today).
2. Fire the DELETE request.
3. On success, show:
   `toast("Entry deleted", { action: { label: "Undo", onClick: restore }, duration: 8000 })`.
4. **Undo** calls the restore endpoint (Part C), then bumps `dataTick` so every
   card re-includes the entry. On undo success, optionally
   `toast("Entry restored")`.
5. On DELETE failure, revert the optimistic removal and `toast.error(...)`.

The Undo toast **replaces** the scary confirm — the toast is the safety net, so
the "You can't undo this" copy is removed.

## Part C — Trash view (recover anytime)

### List endpoints

- `GET /api/activity-logs/trash?player_id=<id>` → hidden `activity_logs` for that
  player (scoped by team like the existing routes).
- `GET /api/self-report/trash?player_id=<id>` → hidden `twilio_messages`,
  grouped by `session_id` (one entry per session, like the timeline groups them).

Both return enough to render a row: id/session_id, kind/category, a short label,
and the original timestamp.

### Restore endpoints (shared with Undo)

Mirror the delete cascade exactly:

- `POST /api/activity-logs/[id]/restore` → `update({ hidden: false })` on the one
  row.
- `POST /api/self-report/[sessionId]/restore` →
  - `update({ hidden: false })` on all `twilio_messages` where
    `session_id = sessionId`, **and**
  - `update({ hidden: false })` on `activity_logs` where `source_sid in (those
    sids)` — the exact reverse of the delete cascade in
    `api/self-report/[sessionId]/route.ts`.

Auth on every endpoint matches the existing delete routes: caller must be the
linked athlete (`impersonate_player_id === row.player_id`) or a coach/admin on
the row's team (`role in {coach, admin}` AND `team_id` match). Only un-hide rows
the caller is authorized for.

### UI

On the athlete page, a collapsible **"Recently deleted (n)"** disclosure below
the activity box, **collapsed by default** so it doesn't clutter:

- When expanded, fetch the two trash endpoints for this player.
- Each row shows a label + original timestamp + a **Restore** button.
- Restore → POST the matching restore endpoint → bump `dataTick` → the entry
  reappears in the timeline/standings and drops out of the trash list.
- `(n)` reflects the count of hidden entries; hide the disclosure entirely when
  `n === 0`.

Visibility of the trash section follows the same `canDelete` rule as the delete
affordance (linked athlete, or coach/admin on the team).

## Rollout

1. `bun add sonner`; mount `<Toaster />` in the dashboard layout.
2. Part A: bump `dataTick` in `onDelete`; thread `refreshKey` into the
   competition card (and any other unkeyed card found in the page-children
   audit). Verify the read-path filters.
3. Part C endpoints: trash list + restore (activity-log + self-report), with the
   cascade-mirroring restore and shared auth.
4. Part B: swap `confirm()` for optimistic-delete + Undo toast wired to the
   activity-log restore / self-report restore endpoints.
5. Part C UI: the "Recently deleted (n)" disclosure on the athlete page.
6. **Definition of done (per CLAUDE.md):** `bun run typecheck`, `bun run lint`,
   `bun run build:web` all green before commit + push.
7. Manual verify: delete an entry → it vanishes from the timeline **and** the
   competition standings without refresh → Undo toast restores it → delete again
   → it appears under "Recently deleted" → Restore brings it back. Repeat for a
   self-report session (confirm the cascade un-hides the linked activity_logs).

## Risks

- **Missed child card in Part A.** If a card on the athlete page reads entries
  but isn't keyed to the refresh signal, its deleted entry lingers until
  refresh. Mitigated by enumerating the page's actual children during
  implementation, not assuming only Competitions.
- **Cascade asymmetry.** If restore doesn't perfectly mirror delete (e.g.
  un-hides the `twilio_messages` session but not the linked `activity_logs`), a
  restored self-report could be partially visible. Mitigated by writing restore
  as the literal inverse of the delete cascade and testing the round-trip.
- **Optimistic revert on failure.** If a DELETE fails after optimistic removal,
  the row must reappear. Handle the non-ok response by reverting local state and
  surfacing `toast.error`, rather than the current silent `alert`.

## Open questions

None. Decisions locked:
- Reuse `hidden` columns; no migration.
- Undo toast **and** per-athlete trash (user chose "Both").
- `sonner` for toasts.
- Trash is per-athlete on the athlete page, not team-wide.
- Restore mirrors the delete cascade; whole-session for self-reports.
- No audit trail, no auto-purge in this version.
