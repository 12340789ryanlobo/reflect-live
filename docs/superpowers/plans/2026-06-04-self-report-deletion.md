# Self-Report Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Athletes can hide their own self-reported sessions and SMS-origin activity logs. Coaches can hide any of those on their team. All read paths skip hidden rows.

**Architecture:** Soft delete via `hidden` boolean on both `twilio_messages` (new) and `activity_logs` (already exists). New `session_id text` column on `twilio_messages` groups Q+A rows from a single self-report submission so one DELETE can hide the whole session. New `DELETE /api/self-report/[sessionId]` endpoint; existing `DELETE /api/activity-logs/[id]` extended to allow athletes. Per-row trash icon on the player-detail page UnifiedTimeline, dispatched by row source.

**Tech Stack:** Next.js 16 App Router · Supabase JS (service-role) · Clerk v7 · TypeScript strict · Vitest · Bun workspaces.

**Spec:** `docs/superpowers/specs/2026-06-04-self-report-deletion-design.md`

**Working directory (all paths relative):**
`/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live/`

---

## File Structure

```
reflect-live/
├── supabase/
│   └── migrations/
│       └── 0034_twilio_messages_soft_delete.sql       NEW: hidden + session_id columns, indexes, backfill
├── apps/
│   └── web/
│       ├── src/
│       │   ├── lib/
│       │   │   ├── delete-permissions.ts              NEW: canDeleteActivityRow shared helper
│       │   │   └── delete-permissions.test.ts         NEW: unit tests for the helper
│       │   ├── app/
│       │   │   ├── api/
│       │   │   │   ├── self-report/
│       │   │   │   │   ├── route.ts                   MODIFY: stamp session_id on insert
│       │   │   │   │   └── [sessionId]/
│       │   │   │   │       └── route.ts               NEW: DELETE handler
│       │   │   │   └── activity-logs/
│       │   │   │       └── [id]/
│       │   │   │           └── route.ts               MODIFY: allow linked athlete
│       │   │   └── dashboard/
│       │   │       └── players/[id]/
│       │   │           └── page.tsx                   MODIFY: wire onDelete + add WHERE hidden=false
│       │   └── components/
│       │       ├── v3/
│       │       │   └── unified-timeline.tsx           MODIFY: render trash icon when onDelete provided
│       │       ├── live-feed.tsx                      MODIFY: WHERE hidden=false
│       │       └── v3/
│       │           └── needs-attention.tsx            MODIFY: WHERE hidden=false
│       └── (sweep) other consumers                    MODIFY: WHERE hidden=false on read queries
```

---

## Task 1: Schema migration + backfill

**Files:**
- Create: `supabase/migrations/0034_twilio_messages_soft_delete.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0034_twilio_messages_soft_delete.sql
--
-- Soft-delete for SMS + self-report rows. Coaches and athletes hide
-- mistake entries via DELETE endpoints that flip hidden = true; all
-- read paths add `WHERE hidden = false`. Pattern mirrors the
-- activity_logs.hidden treatment from migration 0010.
--
-- session_id groups multi-row self-report submissions (one outbound
-- question row + one inbound answer row per answered question, all
-- written in one POST /api/self-report burst). The DELETE endpoint
-- can then hide the whole session with one UPDATE.
--
-- NULL session_id = ingested SMS row (no grouping needed; deletion of
-- those goes through activity_logs.hidden instead).

alter table twilio_messages
  add column if not exists hidden boolean not null default false;

alter table twilio_messages
  add column if not exists session_id text;

-- Visible-rows partial index for the dominant read path. Same trick
-- the activity_logs.hidden migration used.
create index if not exists idx_twm_player_visible_date
  on twilio_messages (player_id, date_sent desc)
  where hidden = false;

create index if not exists idx_twm_session
  on twilio_messages (session_id)
  where session_id is not null;

-- ─── Backfill ────────────────────────────────────────────────────
-- Best-effort grouping of historical 'web-self-*' rows into sessions
-- by time-burst (5s window around an anchor row of the same player).
-- A 'web-self-q-*' outbound + paired 'web-self-a-*' inbound, plus any
-- legacy single-row 'web-self-<uuid>' readiness submissions, all get
-- session_id stamped so the UI doesn't need a separate code path for
-- pre-migration rows.

update twilio_messages t
   set session_id = anchor.sid
  from (
    select sid, player_id, date_sent
    from twilio_messages
    where sid like 'web-self-q-%' or sid like 'web-self-%'
  ) anchor
 where t.session_id is null
   and t.player_id is not null
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

- [ ] **Step 2: Apply via Supabase SQL Editor**

Open Supabase dashboard → SQL Editor → paste the entire file contents → Run. Should complete in under 5 seconds even with full backfill.

- [ ] **Step 3: Verify schema**

Run in the SQL Editor:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'twilio_messages' and column_name in ('hidden', 'session_id')
order by column_name;
```

Expected:
```
hidden     | boolean | NO  | false
session_id | text    | YES | null
```

- [ ] **Step 4: Verify backfill**

```sql
select
  count(*) filter (where sid like 'web-self-%') as self_report_rows,
  count(*) filter (where sid like 'web-self-%' and session_id is null) as unstamped;
```

Expected: `unstamped = 0`. Every self-report row has a session_id.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0034_twilio_messages_soft_delete.sql
git commit -m "migration 0034: soft-delete + session_id on twilio_messages

Add hidden boolean (default false) for soft delete and session_id text
for grouping multi-row self-report submissions. Partial index on
(player_id, date_sent desc) where hidden=false mirrors the activity_logs
treatment from 0010. Backfill stamps session_id on existing web-self-%
rows via 5s time-burst grouping."
```

---

## Task 2: Stamp session_id on POST /api/self-report

**Files:**
- Modify: `apps/web/src/app/api/self-report/route.ts`

- [ ] **Step 1: Add sessionId generation in the multi-question path**

Find the multi-question block in `apps/web/src/app/api/self-report/route.ts` (around the `if (isMulti) { ... }` block). Locate the `const baseMs = Date.now();` line right before the `rows.forEach((p, i) => {` loop. Insert above it:

```ts
    const sessionId = randomUUID();
    const baseMs = Date.now();
```

- [ ] **Step 2: Add session_id to both row objects in the loop**

Inside the loop, both `rows.push({ ... })` calls. Add the `session_id: sessionId,` property right next to `sid:` on each:

```ts
      rows.push({
        sid: `web-self-q-${randomUUID()}`,
        session_id: sessionId,
        direction: 'outbound-api',
        // ...rest unchanged
      });
      rows.push({
        sid: `web-self-a-${randomUUID()}`,
        session_id: sessionId,
        direction: 'inbound',
        // ...rest unchanged
      });
```

- [ ] **Step 3: Same change for the legacy single-readiness path**

Find the single insert at the bottom of the file (after the `// ─── Legacy quick-readiness path ───` comment). Currently:

```ts
  const sid = `web-self-${randomUUID()}`;
  const { error } = await sb
    .from('twilio_messages')
    .insert({
      sid,
      direction: 'inbound',
      // ...
    });
```

Change to use the sid as its own session_id (one-row session, mirroring the backfill convention):

```ts
  const sid = `web-self-${randomUUID()}`;
  const { error } = await sb
    .from('twilio_messages')
    .insert({
      sid,
      session_id: sid,
      direction: 'inbound',
      // ...
    });
```

- [ ] **Step 4: Verify the file typechecks**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -10
```

Expected: no errors (the TS5101 baseUrl deprecation is pre-existing noise).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/self-report/route.ts
git commit -m "self-report: stamp session_id on all inserted rows

One UUID per submission for multi-question; sid itself for the legacy
single-readiness path. Enables session-level soft-delete via
DELETE /api/self-report/[sessionId]."
```

---

## Task 3: Build the permission helper

**Files:**
- Create: `apps/web/src/lib/delete-permissions.ts`
- Create: `apps/web/src/lib/delete-permissions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/lib/delete-permissions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canDeleteActivityRow, type DeletePermissionContext } from './delete-permissions';

function ctx(overrides: Partial<DeletePermissionContext> = {}): DeletePermissionContext {
  return {
    pref: {
      role: 'athlete',
      team_id: 1,
      impersonate_player_id: 42,
      is_platform_admin: false,
    },
    rowPlayerId: 42,
    rowTeamId: 1,
    ...overrides,
  };
}

describe('canDeleteActivityRow', () => {
  it('allows the linked athlete to delete their own row', () => {
    expect(canDeleteActivityRow(ctx())).toBe(true);
  });

  it('forbids an athlete from deleting someone else\'s row', () => {
    expect(canDeleteActivityRow(ctx({ rowPlayerId: 99 }))).toBe(false);
  });

  it('allows a coach on the row\'s team to delete any row', () => {
    expect(
      canDeleteActivityRow(
        ctx({
          pref: { role: 'coach', team_id: 1, impersonate_player_id: null, is_platform_admin: false },
          rowPlayerId: 99,
          rowTeamId: 1,
        }),
      ),
    ).toBe(true);
  });

  it('forbids a coach from deleting a row on a different team', () => {
    expect(
      canDeleteActivityRow(
        ctx({
          pref: { role: 'coach', team_id: 1, impersonate_player_id: null, is_platform_admin: false },
          rowPlayerId: 99,
          rowTeamId: 2,
        }),
      ),
    ).toBe(false);
  });

  it('allows a platform admin to delete any row on any team', () => {
    expect(
      canDeleteActivityRow(
        ctx({
          pref: { role: null, team_id: null, impersonate_player_id: null, is_platform_admin: true },
          rowPlayerId: 99,
          rowTeamId: 999,
        }),
      ),
    ).toBe(true);
  });

  it('forbids a non-linked, non-coach user', () => {
    expect(
      canDeleteActivityRow(
        ctx({
          pref: { role: 'athlete', team_id: 1, impersonate_player_id: null, is_platform_admin: false },
        }),
      ),
    ).toBe(false);
  });

  it('forbids when pref is missing entirely', () => {
    expect(canDeleteActivityRow(ctx({ pref: null }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test apps/web/src/lib/delete-permissions.test.ts 2>&1 | tail -10
```

Expected: fails with `Cannot find module './delete-permissions'`.

- [ ] **Step 3: Write the helper**

Create `apps/web/src/lib/delete-permissions.ts`:

```ts
// Shared permission check for soft-deleting activity rows
// (activity_logs entries and self-report sessions).
//
// Two policies grant delete:
//   - Athlete deleting their own row: pref.impersonate_player_id matches
//     the row's player_id. Works for athlete + captain roles that have
//     impersonate set up.
//   - Coach / admin / platform_admin deleting any row on the row's team:
//     pref.team_id matches the row's team_id (platform admins bypass the
//     team match).

export interface DeletePermissionContext {
  pref: {
    role: string | null;
    team_id: number | null;
    impersonate_player_id: number | null;
    is_platform_admin: boolean | null;
  } | null;
  rowPlayerId: number;
  rowTeamId: number;
}

export function canDeleteActivityRow(ctx: DeletePermissionContext): boolean {
  if (!ctx.pref) return false;

  if (ctx.pref.is_platform_admin === true) return true;

  if (ctx.pref.impersonate_player_id === ctx.rowPlayerId) return true;

  const isCoach = ctx.pref.role === 'coach' || ctx.pref.role === 'admin';
  if (isCoach && ctx.pref.team_id === ctx.rowTeamId) return true;

  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test apps/web/src/lib/delete-permissions.test.ts 2>&1 | tail -5
```

Expected: `7 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/delete-permissions.ts apps/web/src/lib/delete-permissions.test.ts
git commit -m "lib: shared canDeleteActivityRow permission helper

Two grant paths: athlete-self (impersonate_player_id match) and
coach-any-on-team (role + team_id match). Platform admin bypasses both.
Used by activity-logs and self-report DELETE endpoints + the UI's
canDelete prop on each timeline row."
```

---

## Task 4: New DELETE /api/self-report/[sessionId] endpoint

**Files:**
- Create: `apps/web/src/app/api/self-report/[sessionId]/route.ts`

- [ ] **Step 1: Write the route**

```ts
// DELETE /api/self-report/[sessionId]
//
// Hides every twilio_messages row in the named session. Soft delete —
// the rows survive in the DB with hidden=true. Recovery via SQL only;
// no Restore UI in v1.
//
// Permission: the linked athlete (impersonate_player_id == player_id of
// the session's rows) OR a coach/admin on the row's team. Platform
// admins bypass the team check. Shared with the activity-logs DELETE
// endpoint via lib/delete-permissions.
//
// Cascade: any activity_logs rows that mirrored from this session's
// sids are also hidden. Defensive — self-reports are category='survey'
// so the worker's dual-write shouldn't have created any, but a future
// change to that filter could.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { canDeleteActivityRow } from '@/lib/delete-permissions';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
    return NextResponse.json({ error: 'bad_session_id' }, { status: 400 });
  }

  const sb = serviceClient();

  // Find one row to authorize against (every row in the session shares
  // player_id + team_id by construction in /api/self-report).
  const { data: sample } = await sb
    .from('twilio_messages')
    .select('sid, player_id, team_id')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle<{ sid: string; player_id: number | null; team_id: number | null }>();

  if (!sample) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (sample.player_id == null || sample.team_id == null) {
    return NextResponse.json({ error: 'unowned_row' }, { status: 409 });
  }

  const { data: pref } = await sb
    .from('user_preferences')
    .select('role, team_id, impersonate_player_id, is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{
      role: string | null;
      team_id: number | null;
      impersonate_player_id: number | null;
      is_platform_admin: boolean | null;
    }>();

  const allowed = canDeleteActivityRow({
    pref,
    rowPlayerId: sample.player_id,
    rowTeamId: sample.team_id,
  });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Hide all messages in the session.
  const { data: sessionRows, error: hideErr } = await sb
    .from('twilio_messages')
    .update({ hidden: true })
    .eq('session_id', sessionId)
    .select('sid');
  if (hideErr) {
    return NextResponse.json({ error: 'update_failed', detail: hideErr.message }, { status: 500 });
  }

  // Cascade to any activity_logs that mirrored from these sids.
  const sids = (sessionRows ?? []).map((r) => r.sid);
  if (sids.length) {
    const { error: cascadeErr } = await sb
      .from('activity_logs')
      .update({ hidden: true })
      .in('source_sid', sids);
    if (cascadeErr) {
      // Cascade failure is non-fatal — the self-report rows are hidden;
      // the mirror would normally not exist anyway. Log via response.
      return NextResponse.json({ ok: true, cascade_warning: cascadeErr.message });
    }
  }

  return NextResponse.json({ ok: true, hidden_rows: sids.length });
}
```

- [ ] **Step 2: Verify the file typechecks**

```bash
bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -10
```

Expected: no errors.

- [ ] **Step 3: Smoke-test with curl (manual)**

After the worker + web are running locally, find one self-report session_id in Supabase:

```sql
select session_id from twilio_messages where session_id is not null limit 1;
```

Then (substituting a real Clerk session cookie):

```bash
curl -X DELETE "http://localhost:3000/api/self-report/<sessionId>" \
  -H "Cookie: __session=<clerk_session>" \
  -v
```

Expected: `{"ok":true,"hidden_rows":N}`. Verify in Supabase: `SELECT hidden FROM twilio_messages WHERE session_id = '<sessionId>';` all rows show `t`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/self-report/\[sessionId\]/route.ts
git commit -m "feat(api): DELETE /api/self-report/[sessionId]

Soft-hides all twilio_messages rows in the named session and any
activity_logs rows that mirrored from them. Permission via shared
canDeleteActivityRow helper — athlete-self or coach-on-team."
```

---

## Task 5: Extend DELETE /api/activity-logs/[id] for athletes

**Files:**
- Modify: `apps/web/src/app/api/activity-logs/[id]/route.ts`

- [ ] **Step 1: Replace the permission block**

Open `apps/web/src/app/api/activity-logs/[id]/route.ts`. Replace the entire DELETE handler body from `const sb = serviceClient();` through the end with the version that uses the shared helper:

```ts
  const sb = serviceClient();

  // Fetch the row so we can authorize against its player_id + team_id.
  const { data: row } = await sb
    .from('activity_logs')
    .select('player_id, team_id')
    .eq('id', id)
    .maybeSingle<{ player_id: number; team_id: number }>();
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: pref } = await sb
    .from('user_preferences')
    .select('role, team_id, impersonate_player_id, is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{
      role: string | null;
      team_id: number | null;
      impersonate_player_id: number | null;
      is_platform_admin: boolean | null;
    }>();

  const allowed = canDeleteActivityRow({
    pref,
    rowPlayerId: row.player_id,
    rowTeamId: row.team_id,
  });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { error } = await sb
    .from('activity_logs')
    .update({ hidden: true })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add the import at the top of the file**

Just below the existing imports, add:

```ts
import { canDeleteActivityRow } from '@/lib/delete-permissions';
```

- [ ] **Step 3: Verify typecheck**

```bash
bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/activity-logs/\[id\]/route.ts
git commit -m "feat(api): allow linked athletes to delete their own activity_logs

Extends DELETE /api/activity-logs/[id] permission. Coaches still hide
any row on their team; athletes now also hide their own
(impersonate_player_id match). Uses the shared canDeleteActivityRow
helper so the policy stays in lock-step with the new self-report DELETE."
```

---

## Task 6: Read-path sweep — add `WHERE hidden = false` to all twilio_messages reads

**Files (modify all):**
- `apps/web/src/app/dashboard/players/[id]/page.tsx` (two queries: lines ~124 and ~214)
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/dashboard/captain/page.tsx`
- `apps/web/src/app/dashboard/captain/follow-ups/page.tsx`
- `apps/web/src/app/dashboard/live/page.tsx`
- `apps/web/src/app/dashboard/athlete/page.tsx`
- `apps/web/src/app/dashboard/players/page.tsx`
- `apps/web/src/components/live-feed.tsx`
- `apps/web/src/components/v3/needs-attention.tsx`
- `apps/web/src/app/api/players/[id]/summary/route.ts`

**Files to deliberately NOT modify (counts and cascades that include hidden):**
- `apps/web/src/app/dashboard/settings/page.tsx` — total-message count
- `apps/web/src/app/dashboard/admin/page.tsx` — admin count
- `apps/web/src/app/api/admin/people-stats/route.ts` — admin aggregation
- `apps/web/src/app/api/teams/[id]/route.ts:169` — team-delete cascade
- `apps/web/src/app/api/twilio-media/[messageSid]/[mediaSid]/route.ts` — media lookup by sid
- `apps/web/src/app/api/players/[id]/route.ts:161` — UPDATE, not a read
- `apps/web/src/app/api/self-report/route.ts` — INSERTs

- [ ] **Step 1: Find every twilio_messages read with grep**

```bash
grep -rn "\.from('twilio_messages')" apps/web/src --include="*.ts" --include="*.tsx"
```

Expected output matches the lists above. If new sites have appeared since this plan was written, add them to the "modify" list unless they fit one of the explicit "do not modify" categories.

- [ ] **Step 2: Add `.eq('hidden', false)` to each read query**

For every query in the modify list, find its chain and add `.eq('hidden', false)` before `.order(...)` / `.limit(...)`. Example transformation:

Before:
```ts
sb.from('twilio_messages').select('*').eq('team_id', teamId).order('date_sent', { ascending: false }).limit(100)
```

After:
```ts
sb.from('twilio_messages').select('*').eq('team_id', teamId).eq('hidden', false).order('date_sent', { ascending: false }).limit(100)
```

Apply this transformation to each of the 10 call sites listed above. The exact line numbers may shift as you edit; use the grep output to locate them.

- [ ] **Step 3: Defensive client-side filter in UnifiedTimeline**

In `apps/web/src/components/v3/unified-timeline.tsx`, the component receives `messages: TwilioMessage[]` as a prop. The DB filter handles the initial load, but Supabase Realtime can deliver UPDATE events that flip `hidden` after the page loaded. Add a render-time filter so a row that becomes hidden disappears on the next re-render without a refetch.

Find where `buildTimeline` is called (it's the function from `lib/timeline.ts` that merges logs + messages). Replace the input messages with a filtered version:

```ts
// Drop hidden messages defensively — DB query already filters, but
// Realtime UPDATE events for hidden=true should disappear without
// a refetch.
const visibleMessages = useMemo(
  () => messages.filter((m) => !(m as TwilioMessage & { hidden?: boolean }).hidden),
  [messages],
);
```

Then pass `visibleMessages` instead of `messages` to `buildTimeline`. (If the TwilioMessage shared type doesn't yet include `hidden`, the cast above keeps the build clean; the next task adds the field properly.)

- [ ] **Step 4: Add `hidden` field to the shared TwilioMessage type**

Modify `packages/shared/src/types.ts`. Find the `export interface TwilioMessage` block and add `hidden?: boolean;` and `session_id?: string | null;` near the other optional fields. This removes the cast in step 3.

After adding the fields, simplify the UnifiedTimeline filter:

```ts
const visibleMessages = useMemo(
  () => messages.filter((m) => !m.hidden),
  [messages],
);
```

- [ ] **Step 5: Verify typecheck and tests pass**

```bash
bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -10
bun test apps/web 2>&1 | tail -10
```

Expected: no new errors; tests still pass (108+).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts apps/web/src
git commit -m "feat: skip hidden twilio_messages everywhere

Adds .eq('hidden', false) to every read query against twilio_messages
across dashboard pages, captain views, live feed, needs-attention, and
the player-summary API route. Adds hidden + session_id to the shared
TwilioMessage type. UnifiedTimeline also filters at render time so
Realtime UPDATE events for hidden=true disappear without a refetch.

Excluded by design: admin counts, settings totals, team-delete cascade,
twilio-media lookup-by-sid, and write paths (INSERT/UPDATE/DELETE)."
```

---

## Task 7: Wire onDelete + trash icon into UnifiedTimeline

**Files:**
- Modify: `apps/web/src/components/v3/unified-timeline.tsx`

- [ ] **Step 1: Add the onDelete prop and a canDelete predicate prop**

Find the `interface Props { ... }` block. Add:

```ts
interface Props {
  logs: ActivityLog[];
  messages: TwilioMessage[];
  period: Period;
  selectedRegions?: string[];
  onClearRegionFilter?: () => void;
  /**
   * Per-entry delete handler. When provided AND canDelete returns true,
   * a trash icon renders on the row and clicking it dispatches to the
   * right backend (activity_logs vs self-report) via this callback.
   * The parent owns optimistic UI removal.
   */
  onDelete?: (entry: TimelineEntry) => void;
  /**
   * Predicate the row renderer calls to decide whether to show the
   * trash icon for a given entry. Centralizes the athlete-self /
   * coach-any policy at the parent so this component doesn't need
   * permission context.
   */
  canDelete?: (entry: TimelineEntry) => boolean;
}
```

- [ ] **Step 2: Render the trash icon in the row renderer**

Find the JSX that renders each timeline row (look for where individual entries map to JSX). Add a trash icon at the end of each row's actions cluster:

```tsx
import { Trash2, X } from 'lucide-react';  // Add Trash2 to the existing lucide import

// ...inside the row render...
{onDelete && canDelete?.(entry) && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onDelete(entry);
    }}
    className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)] transition opacity-0 group-hover:opacity-100"
    aria-label="Hide this entry"
    title="Hide this entry"
  >
    <Trash2 className="size-3.5" />
  </button>
)}
```

The `group-hover:opacity-100` keeps the icon discoverable without being noisy — only appears when hovering the row. Add `group` to the row's outer container className if it isn't already there.

- [ ] **Step 3: Verify typecheck**

```bash
bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -10
```

Expected: no errors. The new props are optional, so existing call sites (if any) still compile.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/v3/unified-timeline.tsx
git commit -m "feat(ui): trash icon on UnifiedTimeline rows when delete enabled

Adds optional onDelete + canDelete props. When both are provided, a
hover-revealed trash icon renders on each row and dispatches the
delete via the parent-supplied callback. Parent owns the permission
check + which endpoint to call."
```

---

## Task 8: Wire delete logic on the player detail page

**Files:**
- Modify: `apps/web/src/app/dashboard/players/[id]/page.tsx`

- [ ] **Step 1: Import the permission helper and necessary types**

At the top of the file, near the existing imports, add:

```ts
import { canDeleteActivityRow } from '@/lib/delete-permissions';
import type { TimelineEntry } from '@/lib/timeline';
```

- [ ] **Step 2: Define canDelete and onDelete in the component**

In the player page component body, after the existing `prefs` / `player` hooks, add:

```ts
  const canDelete = useCallback(
    (entry: TimelineEntry): boolean => {
      if (!player) return false;
      return canDeleteActivityRow({
        pref: {
          role: prefs.role ?? null,
          team_id: prefs.team_id ?? null,
          impersonate_player_id: prefs.impersonate_player_id ?? null,
          is_platform_admin: prefs.is_platform_admin ?? false,
        },
        rowPlayerId: player.id,
        rowTeamId: player.team_id,
      });
    },
    [player, prefs],
  );

  const onDelete = useCallback(
    async (entry: TimelineEntry) => {
      if (!confirm('Hide this entry from the leaderboard? You can\'t undo this from the UI.')) {
        return;
      }

      // Optimistic removal: drop the row from local state before the
      // request resolves. If it fails we re-fetch on the next reload.
      const url =
        entry.meta.source === 'log'
          ? `/api/activity-logs/${entry.meta.logId}`
          : (() => {
              const msg = messages.find((m) => m.sid === entry.meta.sid);
              const sessionId = (msg as TwilioMessage & { session_id?: string | null })?.session_id;
              return sessionId ? `/api/self-report/${encodeURIComponent(sessionId)}` : null;
            })();

      if (!url) {
        alert('This row has no session_id — cannot delete from UI. Fix via SQL.');
        return;
      }

      if (entry.meta.source === 'log') {
        setLogs((current) => current.filter((l) => l.id !== entry.meta.logId));
      } else {
        const msg = messages.find((m) => m.sid === entry.meta.sid);
        const sessionId = (msg as TwilioMessage & { session_id?: string | null })?.session_id;
        if (sessionId) {
          setMessages((current) =>
            current.filter(
              (m) => (m as TwilioMessage & { session_id?: string | null }).session_id !== sessionId,
            ),
          );
        }
      }

      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        alert('Delete failed. Refresh to restore the row.');
      }
    },
    [messages, setLogs, setMessages],
  );
```

You'll need `useCallback` in the React imports if it isn't there already.

- [ ] **Step 3: Pass the props to UnifiedTimeline**

Find the `<UnifiedTimeline ... />` JSX usage. Add the new props:

```tsx
<UnifiedTimeline
  logs={logs}
  messages={messages}
  period={period}
  selectedRegions={selectedRegions}
  onClearRegionFilter={() => setSelectedRegions([])}
  canDelete={canDelete}
  onDelete={onDelete}
/>
```

(Preserve any existing props that are already there; just add `canDelete` and `onDelete`.)

- [ ] **Step 4: Verify typecheck**

```bash
bunx tsc --noEmit -p apps/web 2>&1 | grep -v "TS5101.*baseUrl" | head -10
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

```bash
bun run dev:web
```

Then in a browser:
1. Sign in as a coach.
2. Navigate to `/dashboard/players/<athlete_id>`.
3. Hover any row in the Activity timeline. Trash icon should appear on hover.
4. Click trash → confirm modal → row disappears optimistically.
5. Refresh the page. Row stays gone.
6. In Supabase, verify the corresponding row's `hidden = true`.
7. Sign in as the athlete (impersonate setup permitting). Same drill on their own row.
8. As a coach on a different team, navigate to another team's player page — trash icon should NOT appear.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/players/\[id\]/page.tsx
git commit -m "feat(ui): wire delete affordance on player detail page

Trash icon on each timeline row, visible to the linked athlete and to
coaches/admins on the row's team. Dispatches by row source:
activity_logs entries hit DELETE /api/activity-logs/[id]; self-report
entries hit DELETE /api/self-report/[sessionId]. Confirm modal + toast,
optimistic local-state removal."
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Submit a fresh self-report**

In the browser:
1. Sign in as an athlete (or impersonate as platform admin).
2. Open the SelfReportDialog from the player page.
3. Submit a quick readiness check (e.g., readiness 7, notes "verification test").

- [ ] **Step 2: Verify it appears in:**
- The player timeline (with the new row visible at the top)
- The dashboard live feed
- Supabase: `select * from twilio_messages where body like '%verification test%';` shows 1 row with `hidden=false`, `session_id` populated

- [ ] **Step 3: Delete it via the trash icon**

Hover the new row → click trash → confirm. Row disappears.

- [ ] **Step 4: Verify it's gone from:**
- The player timeline (no longer visible)
- The dashboard live feed (no longer visible)
- Survey trends card (if it was contributing to a metric, the metric should re-aggregate without it)
- Supabase: `select hidden from twilio_messages where body like '%verification test%';` shows `t`

- [ ] **Step 5: Verify it's NOT permanently gone**

`select * from twilio_messages where body like '%verification test%';` returns the row with `hidden = true`. Hard-deleted rows wouldn't return at all — confirming soft delete.

- [ ] **Step 6: Repeat for an activity log**

1. Send a `Workout: verification test` SMS from your phone (or use the LogActivityDialog).
2. Wait for the worker to ingest (~15s).
3. Verify it appears on the player page.
4. Delete via trash icon.
5. Verify gone from UI; `select hidden from activity_logs where description like '%verification test%';` shows `t`.

- [ ] **Step 7: Permission boundary check**

1. As a coach on Team A, open `/dashboard/players/<athlete_on_team_B>`.
2. Verify the trash icon does NOT appear on any row.
3. (Optional) Send a curl `DELETE /api/self-report/<their_session_id>` while signed in as Coach-A; expect 403.

- [ ] **Step 8: Final commit (verification doc, optional)**

If you want a record of the verification pass:

```bash
echo "Verified 2026-MM-DD: end-to-end delete flow works for both activity_logs and self-report sessions. Permission boundary enforced." >> ideas.md
git add ideas.md
git commit -m "verified: self-report deletion end-to-end"
```

---

## Self-review checklist

- [x] **Spec coverage:** Every section of the spec maps to a task — schema (Task 1), backfill (Task 1), POST stamp (Task 2), permission helper (Task 3), DELETE self-report (Task 4), DELETE activity-logs extension (Task 5), read-path sweep (Task 6), UI plumbing (Tasks 7 + 8), verification (Task 9).
- [x] **Placeholder scan:** No TBD/TODO/"add error handling"/"similar to" left in the steps.
- [x] **Type consistency:** `DeletePermissionContext`, `canDeleteActivityRow`, `TimelineEntry`, and prop signatures are referenced identically across tasks 3, 4, 5, 7, 8.
- [x] **Test code shown:** Every test step includes the actual test body. Every code step shows the actual code.
- [x] **Exact paths everywhere.** Commands quoted with the working-dir base.
