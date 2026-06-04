# Self-report deletion + activity-log delete UI restoration

**Date:** 2026-06-04
**Status:** Design — pending implementation

## Problem

Athletes and coaches have no way to remove a self-reported session from the dashboard. A self-report submitted by mistake (wrong athlete impersonated, wrong readiness number, finger-fumbled answers) stays in the data permanently and contributes to survey-trends, readiness parsing, and downstream metrics with no remediation.

The sibling problem also exists for SMS-origin activity logs (workout/rehab rows): the soft-delete backend (`DELETE /api/activity-logs/[id]` → `hidden = true`) still works, but its only UI consumer was `/dashboard/fitness/page.tsx`, which was deleted in commit `7d97e86` when activity was merged into competitions. Coaches who want to hide a mistake `Workout:` SMS currently have to write SQL by hand.

This spec covers both deletions under a single unified deletion affordance on the player detail page.

## Goals

- Athletes can hide their own self-reported sessions and their own SMS-origin activity_log rows.
- Coaches/admins can hide any self-report and any activity_log on their team.
- Soft delete only — no row is destroyed, deletion can be reversed in SQL.
- Read paths (survey-trends, readiness parser, live feed, leaderboard) skip hidden rows.
- Single UI surface — the player detail page — covers both data types with one pattern.

## Non-goals (v1)

- Per-answer deletion within a multi-question self-report. Session-level only.
- Undo affordance in the UI. Soft-delete is recoverable in SQL; no Restore button.
- Audit trail (`deleted_by`, `deleted_at`). Skip until someone asks.
- Bulk delete or admin moderation list view.
- Coach-only "purge to disk" hard delete.

## Data model

### twilio_messages — two new columns

```sql
-- migration 0034_twilio_messages_soft_delete.sql

alter table twilio_messages
  add column if not exists hidden boolean not null default false;

alter table twilio_messages
  add column if not exists session_id text;

-- Partial index for the dominant read path (visible rows only). Mirrors
-- the activity_logs.hidden pattern from migration 0010.
create index if not exists idx_twm_player_visible_date
  on twilio_messages (player_id, date_sent desc)
  where hidden = false;

create index if not exists idx_twm_session
  on twilio_messages (session_id)
  where session_id is not null;
```

`session_id` is NULL for non-self-report rows (real SMS). For self-report rows it holds the UUID generated per POST so a single DELETE can hide the whole session.

### Backfill for existing self-report rows

```sql
-- For each player, group web-self-* rows by time-burst (rows whose
-- date_sent is within 5s of a 'web-self-q-*' or 'web-self-*' anchor).
-- Sets session_id to the anchor row's sid. Best-effort — legacy
-- readiness rows (single 'web-self-<uuid>' row, no q/a pair) get their
-- own sid as session_id so they're individually deletable.
update twilio_messages t
   set session_id = anchor.sid
  from (
    select sid, player_id, date_sent
    from twilio_messages
    where sid like 'web-self-q-%' or sid like 'web-self-%'
  ) anchor
 where t.session_id is null
   and t.player_id = anchor.player_id
   and t.date_sent >= anchor.date_sent
   and t.date_sent <= anchor.date_sent + interval '5 seconds'
   and (t.sid like 'web-self-%' or t.sid = anchor.sid);

-- Fallback: any remaining 'web-self-%' row without a session_id gets
-- its own sid as session_id (one-row session).
update twilio_messages
   set session_id = sid
 where session_id is null
   and sid like 'web-self-%';
```

The backfill is a one-shot migration script, not a hot-path query.

## Write path

### POST /api/self-report (existing — needs one change)

Generate a single `sessionId = randomUUID()` per request and stamp it on every synthetic row in that submission:

```ts
const sessionId = randomUUID();
// ... existing pair loop ...
rows.push({
  sid: `web-self-q-${randomUUID()}`,
  session_id: sessionId,   // NEW
  // ...
});
rows.push({
  sid: `web-self-a-${randomUUID()}`,
  session_id: sessionId,   // NEW
  // ...
});
```

Legacy single-readiness path same idea — one sessionId for the single row.

### Realtime publication

`twilio_messages` is already in the Supabase realtime publication. Subscribers get UPDATE events when `hidden` flips. UI components re-evaluate visibility on UPDATE (alternatively: render-time filter on `hidden`).

## Read path — `WHERE hidden = false` sweep

Every consumer of `twilio_messages` adds `.eq('hidden', false)` to its Supabase query:

| File | Current usage |
|---|---|
| `apps/web/src/lib/survey-trends.ts` | Pairs Q/A rows for trend metrics |
| `apps/web/src/lib/timeline.ts` (`unified-timeline.tsx`) | Activity feed on player page |
| `apps/web/src/components/live-feed.tsx` | Dashboard live message stream |
| `apps/web/src/lib/survey-injuries.ts` | Injury extraction from pain replies |
| `apps/worker/src/poll.ts` (dual-write to activity_logs) | Skip if source row is hidden |

For the worker's activity_logs dual-write, hidden source rows must NOT produce activity_log rows. Since the worker writes activity_logs at ingest time, hiding a twilio_messages row later requires a follow-up: the DELETE endpoint also hides the corresponding activity_logs row by `source_sid` match.

## Delete endpoints

### Activity logs — extend existing endpoint

`apps/web/src/app/api/activity-logs/[id]/route.ts` currently allows only coach/admin. Extend the permission check to also allow the linked athlete (impersonate_player_id == row.player_id):

```ts
const { data: row } = await sb
  .from('activity_logs')
  .select('player_id, team_id')
  .eq('id', id)
  .maybeSingle();
if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

const isCoachOrAdmin = (pref?.role === 'coach' || pref?.role === 'admin')
  && pref.team_id === row.team_id;
const isLinkedAthlete = pref?.impersonate_player_id === row.player_id;

if (!isCoachOrAdmin && !isLinkedAthlete) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

await sb.from('activity_logs').update({ hidden: true }).eq('id', id);
```

### Self-report — new endpoint

`apps/web/src/app/api/self-report/[sessionId]/route.ts` — DELETE handler. Hides all twilio_messages rows in the session plus any activity_logs rows that mirrored from those sids.

```ts
export async function DELETE(_req, { params }) {
  const { sessionId } = await params;
  // ... auth (matches activity-logs route's pattern) ...

  // Look up the session to authorize against player_id/team_id.
  const { data: rows } = await sb
    .from('twilio_messages')
    .select('sid, player_id, team_id')
    .eq('session_id', sessionId)
    .limit(1);
  if (!rows?.length) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const row = rows[0];
  // Permission check identical to activity-logs above.

  // Hide all messages in the session...
  await sb.from('twilio_messages')
    .update({ hidden: true })
    .eq('session_id', sessionId);

  // ...and any activity_logs that mirrored from those sids (defensive;
  // self-reports are category='survey' so the dual-write shouldn't have
  // created any, but cheap to be sure).
  const { data: sessionRows } = await sb
    .from('twilio_messages')
    .select('sid')
    .eq('session_id', sessionId);
  const sids = (sessionRows ?? []).map(r => r.sid);
  if (sids.length) {
    await sb.from('activity_logs')
      .update({ hidden: true })
      .in('source_sid', sids);
  }

  return NextResponse.json({ ok: true });
}
```

## UI

`apps/web/src/app/dashboard/players/[id]/page.tsx` is the single home. The page already renders the activity feed; add a per-row trash icon visible when the caller is either the linked athlete or a coach/admin.

```tsx
{canDelete(row) && (
  <button onClick={() => deleteRow(row)} aria-label="Hide this entry"
          className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)]">
    <Trash2 className="size-3.5" />
  </button>
)}
```

`canDelete(row)`:
- `pref.impersonate_player_id === row.player_id` (athlete deleting own), OR
- `pref.role in {coach, admin}` AND `pref.team_id === row.team_id` (coach deleting any)

`deleteRow` routes by source:
- Activity-log row → `DELETE /api/activity-logs/[id]`
- Self-report row → `DELETE /api/self-report/[sessionId]`

Confirm modal copy (matches the deleted fitness page):
> "Hide this entry from the leaderboard? You can't undo this from the UI."

Optimistic UI removal; toast on success/failure.

## Rollout

1. Migration `0034_twilio_messages_soft_delete.sql` applied via Supabase SQL editor.
2. Backfill script run once to populate `session_id` for historical self-report rows.
3. Read-path sweep deployed (adds `.eq('hidden', false)` to all twilio_messages queries).
4. Activity-log DELETE endpoint extended to athletes; self-report DELETE endpoint added.
5. Player page UI updated.
6. Verify by self-reporting a test session and deleting it; confirm it disappears from survey-trends, live feed, and player timeline.

## Open questions

None. All decisions made:
- Soft delete (not hard).
- Both athlete and coach can delete (athlete-self / coach-any).
- Whole-session granularity (not per-answer).
- Bundled with activity-log delete restoration.
- No undo, no audit, no bulk delete in v1.

## Risks

- **Read-path sweep miss:** if a consumer of twilio_messages is missed in step 3, hidden rows will still leak into that view. Mitigated by listing all known consumers in the spec; one-line greps in implementation will catch additions made since.
- **Backfill mis-grouping:** the 5s time-burst heuristic could occasionally lump two distinct sessions together if a single player POSTed twice in quick succession. Low probability given the SelfReportDialog UX. Acceptable for historical data.
- **Realtime UPDATE handling:** components that don't subscribe to UPDATE on twilio_messages may show a stale visible row until the next refresh. Mitigation: render-time filter on `hidden` so even if the row is in local state, it doesn't render.
