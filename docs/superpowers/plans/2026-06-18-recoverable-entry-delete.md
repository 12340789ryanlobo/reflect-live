# Recoverable Entry Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deleting an entry from the athlete page remove it everywhere immediately (timeline, competitions, rank, trends), and make a mistaken delete recoverable via an Undo toast and a per-athlete "Recently deleted" trash section.

**Architecture:** No schema change — entries are already soft-deleted (`hidden=true` on `activity_logs` and `twilio_messages`). We (A) bump the existing `dataTick` refresh signal on delete/restore and thread it into the one card that self-fetches (Competitions) plus two effects that currently miss it; (B) add `sonner` and replace the blocking `confirm()` with an optimistic-delete + Undo toast; (C) add restore endpoints (the exact inverse of the delete handlers, including the self-report cascade) plus trash-list endpoints and a collapsible "Recently deleted" card.

**Tech Stack:** Next.js 16 App Router, React client components, Supabase service-role client in route handlers, Clerk auth, Tailwind v4, `sonner` for toasts.

---

## Boundaries / non-goals (read before starting)

- **No migration.** `hidden` already exists on both tables (migrations 0010, 0034). Restore = set `hidden=false`.
- **There is a third, separate deletion mechanism** — `sessions.deleted_at` + a `deliveries` time-window filter in `players/[id]/page.tsx` (the first effect, ~lines 155–185). That path hides *bot-conducted* Twilio survey sessions and is **out of scope**. The activity-box trash button only deletes via the two `hidden` endpoints (`/api/activity-logs/[id]` and `/api/self-report/[sessionId]`), so restore/trash only cover those two. Do **not** touch the `sessions.deleted_at` / `deliveries` code.
- **Bot-survey messages have `session_id = NULL`** and already can't be deleted from the timeline, so they never appear in trash. Only `web-self-*` sessions (non-null `session_id`) do.

## Verification model (this repo has no web test runner)

Per `CLAUDE.md`, the web app's definition of done is `bun run typecheck`, `bun run lint`, `bun run build:web` — there is **no** unit-test harness for `apps/web` (`bun run test` covers only worker + scripts). So these tasks do **not** use TDD-style failing unit tests; each task is verified by the DoD gates plus a manual round-trip at the end (Task 8). This is the honest verification path for this codebase and overrides the skill's default TDD step.

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `apps/web/package.json` | Modify | add `sonner` dep |
| `apps/web/src/app/dashboard/layout.tsx` | Modify | mount `<Toaster />` |
| `apps/web/src/app/api/activity-logs/[id]/restore/route.ts` | Create | POST: un-hide one activity_log |
| `apps/web/src/app/api/self-report/[sessionId]/restore/route.ts` | Create | POST: un-hide a session + cascade |
| `apps/web/src/app/api/activity-logs/trash/route.ts` | Create | GET: list hidden activity_logs for a player |
| `apps/web/src/app/api/self-report/trash/route.ts` | Create | GET: list hidden self-report sessions for a player |
| `apps/web/src/components/v3/competition-standing-card.tsx` | Modify | accept `refreshKey`, refetch on it |
| `apps/web/src/components/v3/recently-deleted-card.tsx` | Create | collapsible trash UI + Restore |
| `apps/web/src/app/dashboard/players/[id]/page.tsx` | Modify | bump `dataTick` on delete/restore; Undo toast; wire `refreshKey`; add effect deps; render trash card |

---

## Task 1: Add sonner + Toaster

**Files:**
- Modify: `apps/web/package.json` (via `bun add`)
- Modify: `apps/web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Install sonner**

Run from repo root:
```bash
cd apps/web && bun add sonner && cd ../..
```
Expected: `sonner` appears under `dependencies` in `apps/web/package.json`.

- [ ] **Step 2: Mount the Toaster in the dashboard layout**

Replace the entire contents of `apps/web/src/app/dashboard/layout.tsx` with:
```tsx
import { DashboardShell } from '@/components/dashboard-shell';
import { Toaster } from 'sonner';
import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell>
      {children}
      <Toaster position="bottom-center" richColors closeButton />
    </DashboardShell>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run:
```bash
bun run typecheck && bun run build:web
```
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/bun.lock apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(web): add sonner toaster to dashboard layout"
```
(If the lockfile is named differently, stage whatever lockfile `bun add` modified.)

---

## Task 2: Activity-log restore endpoint

**Files:**
- Create: `apps/web/src/app/api/activity-logs/[id]/restore/route.ts`

This is the exact inverse of the existing DELETE in `apps/web/src/app/api/activity-logs/[id]/route.ts` — same auth, `hidden: false` instead of `true`.

- [ ] **Step 1: Create the route**

```ts
// apps/web/src/app/api/activity-logs/[id]/restore/route.ts
//
// Un-hide a previously soft-deleted activity_logs row (set hidden=false).
// Exact inverse of the DELETE handler in ../route.ts; same auth.

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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }

  const sb = serviceClient();

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
    .update({ hidden: false })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/activity-logs/[id]/restore/route.ts
git commit -m "feat(api): restore endpoint for soft-deleted activity logs"
```

---

## Task 3: Self-report restore endpoint

**Files:**
- Create: `apps/web/src/app/api/self-report/[sessionId]/restore/route.ts`

Exact inverse of the DELETE cascade in `apps/web/src/app/api/self-report/[sessionId]/route.ts`: un-hide every `twilio_messages` row in the session AND any `activity_logs` mirrored from those sids.

- [ ] **Step 1: Create the route**

```ts
// apps/web/src/app/api/self-report/[sessionId]/restore/route.ts
//
// Un-hide a previously soft-deleted self-report session. Exact inverse of
// the DELETE handler in ../route.ts: sets hidden=false on every
// twilio_messages row in the session AND any activity_logs that mirrored
// from those sids. Same auth.

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

export async function POST(
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

  // Find one row to authorize against. No hidden filter — the rows we're
  // restoring are currently hidden=true.
  const { data: rows } = await sb
    .from('twilio_messages')
    .select('sid, player_id, team_id')
    .eq('session_id', sessionId)
    .limit(1)
    .returns<Array<{ sid: string; player_id: number | null; team_id: number | null }>>();
  const sample = rows?.[0] ?? null;

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

  // Un-hide all messages in the session.
  const { data: sessionRows, error: showErr } = await sb
    .from('twilio_messages')
    .update({ hidden: false })
    .eq('session_id', sessionId)
    .select('sid');
  if (showErr) {
    return NextResponse.json({ error: 'update_failed', detail: showErr.message }, { status: 500 });
  }

  // Reverse the cascade: un-hide any activity_logs mirrored from these sids.
  const sids = (sessionRows ?? []).map((r) => r.sid);
  if (sids.length) {
    const { error: cascadeErr } = await sb
      .from('activity_logs')
      .update({ hidden: false })
      .in('source_sid', sids);
    if (cascadeErr) {
      return NextResponse.json({ ok: true, cascade_warning: cascadeErr.message });
    }
  }

  return NextResponse.json({ ok: true, restored_rows: sids.length });
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/self-report/[sessionId]/restore/route.ts
git commit -m "feat(api): restore endpoint for soft-deleted self-report sessions"
```

---

## Task 4: Trash-list endpoints

**Files:**
- Create: `apps/web/src/app/api/activity-logs/trash/route.ts`
- Create: `apps/web/src/app/api/self-report/trash/route.ts`

- [ ] **Step 1: Create the activity-logs trash route**

```ts
// apps/web/src/app/api/activity-logs/trash/route.ts
//
// GET /api/activity-logs/trash?player_id=<id>
// Lists soft-deleted (hidden=true) activity_logs for a player so the
// athlete page can offer Restore. Auth matches the delete endpoints:
// linked athlete or coach/admin on the player's team.

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

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const playerId = Number(req.nextUrl.searchParams.get('player_id'));
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: 'bad_player_id' }, { status: 400 });
  }

  const sb = serviceClient();

  const { data: player } = await sb
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .maybeSingle<{ id: number; team_id: number }>();
  if (!player) return NextResponse.json({ error: 'not_found' }, { status: 404 });

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
    rowPlayerId: player.id,
    rowTeamId: player.team_id,
  });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: rows, error } = await sb
    .from('activity_logs')
    .select('id, kind, description, logged_at')
    .eq('player_id', playerId)
    .eq('hidden', true)
    .order('logged_at', { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: rows ?? [] });
}
```

- [ ] **Step 2: Create the self-report trash route**

```ts
// apps/web/src/app/api/self-report/trash/route.ts
//
// GET /api/self-report/trash?player_id=<id>
// Lists soft-deleted (hidden=true) self-report sessions for a player,
// grouped by session_id (one restorable entry per session). Auth matches
// the delete endpoints. Bot-survey rows (session_id NULL) are excluded.

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

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const playerId = Number(req.nextUrl.searchParams.get('player_id'));
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: 'bad_player_id' }, { status: 400 });
  }

  const sb = serviceClient();

  const { data: player } = await sb
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .maybeSingle<{ id: number; team_id: number }>();
  if (!player) return NextResponse.json({ error: 'not_found' }, { status: 404 });

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
    rowPlayerId: player.id,
    rowTeamId: player.team_id,
  });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: rows, error } = await sb
    .from('twilio_messages')
    .select('session_id, body, direction, date_sent')
    .eq('player_id', playerId)
    .eq('hidden', true)
    .not('session_id', 'is', null)
    .order('date_sent', { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
  }

  // Group by session_id. Each session is one restorable entry: earliest
  // date_sent as the timestamp, the first inbound body (or 'Self-report')
  // as the label.
  const bySession = new Map<string, { session_id: string; date_sent: string; label: string }>();
  for (const r of (rows ?? []) as Array<{
    session_id: string; body: string | null; direction: string; date_sent: string;
  }>) {
    const existing = bySession.get(r.session_id);
    if (!existing) {
      bySession.set(r.session_id, {
        session_id: r.session_id,
        date_sent: r.date_sent,
        label: r.direction === 'inbound' && r.body ? r.body : 'Self-report',
      });
      continue;
    }
    if (r.date_sent < existing.date_sent) existing.date_sent = r.date_sent;
    if (existing.label === 'Self-report' && r.direction === 'inbound' && r.body) {
      existing.label = r.body;
    }
  }

  const sessions = Array.from(bySession.values()).sort((a, b) =>
    a.date_sent < b.date_sent ? 1 : -1,
  );

  return NextResponse.json({ sessions });
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/activity-logs/trash/route.ts apps/web/src/app/api/self-report/trash/route.ts
git commit -m "feat(api): trash-list endpoints for soft-deleted entries"
```

---

## Task 5: Propagation fix — thread the refresh signal

**Files:**
- Modify: `apps/web/src/components/v3/competition-standing-card.tsx`
- Modify: `apps/web/src/app/dashboard/players/[id]/page.tsx`

The athlete page already has a `dataTick` counter. Three readers currently don't react to it: the Competitions card (self-fetches on mount), the season-rank effect, and the last-inbound effect. Wire all three. (The main data effect at line ~192 already depends on `dataTick`; the heatmap/trends/hero derive from its `logs`/`msgs` via memo, so they update for free.)

- [ ] **Step 1: Add `refreshKey` to the Competitions card**

In `apps/web/src/components/v3/competition-standing-card.tsx`, change the `Props` interface and the component signature:

```ts
interface Props {
  teamId: number;
  playerId: number;
  refreshKey?: number;
}

export function CompetitionStandingCard({ teamId, playerId, refreshKey }: Props) {
```

Then change the effect's dependency array (currently `}, [teamId, playerId]);`) to:

```ts
  }, [teamId, playerId, refreshKey]);
```

- [ ] **Step 2: Pass `dataTick` into the card**

In `apps/web/src/app/dashboard/players/[id]/page.tsx`, change the render (currently `<CompetitionStandingCard teamId={team.id} playerId={player.id} />`) to:

```tsx
        <CompetitionStandingCard teamId={team.id} playerId={player.id} refreshKey={dataTick} />
```

- [ ] **Step 3: Add `dataTick` to the season-rank effect deps**

In the same file, the season-rank effect ends with:
```ts
  }, [sb, team.id, team.scoring_json, team.competition_start_date, playerId]);
```
Change it to:
```ts
  }, [sb, team.id, team.scoring_json, team.competition_start_date, playerId, dataTick]);
```

- [ ] **Step 4: Add `dataTick` to the last-inbound effect deps**

In the same file, the "Last on wire" effect ends with:
```ts
  }, [sb, playerId]);
```
There are multiple effects; target the one whose body selects `twilio_messages` `date_sent` with `.eq('direction', 'inbound')` and calls `setLastInboundEver`. Change its deps to:
```ts
  }, [sb, playerId, dataTick]);
```

- [ ] **Step 5: Typecheck + lint**

Run:
```bash
bun run typecheck && bun run lint
```
Expected: both clean. (Lint will flag a missing hook dependency if you misspelled `dataTick` — fix if so.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/v3/competition-standing-card.tsx apps/web/src/app/dashboard/players/[id]/page.tsx
git commit -m "fix(web): refetch competitions/rank/last-inbound on entry delete"
```

---

## Task 6: Undo toast — rewrite `onDelete`

**Files:**
- Modify: `apps/web/src/app/dashboard/players/[id]/page.tsx`

Replace the blocking `confirm()` / `alert()` flow with optimistic-delete + an 8s Undo toast. On failure, revert the optimistic removal. On success, bump `dataTick` so all cards refresh.

- [ ] **Step 1: Import `toast`**

Add to the import block at the top of `players/[id]/page.tsx` (after the existing imports):
```ts
import { toast } from 'sonner';
```

- [ ] **Step 2: Replace the `onDelete` callback**

Replace the entire existing `onDelete` useCallback (the one that starts `const onDelete = useCallback(` and uses `confirm(...)`) with:

```tsx
  const onDelete = useCallback(
    async (entry: TimelineEntry) => {
      if (entry.meta.source === 'log') {
        const logId = entry.meta.logId;
        const snapshot = logs;
        setLogs((current) => current.filter((l) => l.id !== logId));
        const res = await fetch(`/api/activity-logs/${logId}`, { method: 'DELETE' });
        if (!res.ok) {
          setLogs(snapshot);
          toast.error('Delete failed — nothing was removed.');
          return;
        }
        setDataTick((n) => n + 1);
        toast('Entry deleted', {
          duration: 8000,
          action: {
            label: 'Undo',
            onClick: async () => {
              const r = await fetch(`/api/activity-logs/${logId}/restore`, { method: 'POST' });
              if (!r.ok) { toast.error('Restore failed.'); return; }
              setDataTick((n) => n + 1);
            },
          },
        });
        return;
      }

      // entry.meta.source === 'msg' — find the message by sid to get its session_id.
      const sid = entry.meta.sid;
      const msg = msgs.find((m) => m.sid === sid);
      const sessionId = msg?.session_id ?? null;
      if (!sessionId) {
        toast.error('This row has no session_id — cannot delete from UI.');
        return;
      }
      const snapshot = msgs;
      // Optimistic removal: drop all rows in the same session.
      setMsgs((current) => current.filter((m) => m.session_id !== sessionId));
      const res = await fetch(`/api/self-report/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setMsgs(snapshot);
        toast.error('Delete failed — nothing was removed.');
        return;
      }
      setDataTick((n) => n + 1);
      toast('Entry deleted', {
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: async () => {
            const r = await fetch(
              `/api/self-report/${encodeURIComponent(sessionId)}/restore`,
              { method: 'POST' },
            );
            if (!r.ok) { toast.error('Restore failed.'); return; }
            setDataTick((n) => n + 1);
          },
        },
      });
    },
    [logs, msgs, setLogs, setMsgs],
  );
```

Note: the deps now include `logs` (needed for the failure-revert snapshot). `setDataTick` and `toast` are stable and don't need to be listed.

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
bun run typecheck && bun run lint
```
Expected: both clean. If lint complains the effect/callback is missing a dep, add exactly the dep it names.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/players/[id]/page.tsx
git commit -m "feat(web): undo toast for deleted entries, optimistic revert on failure"
```

---

## Task 7: "Recently deleted" trash card

**Files:**
- Create: `apps/web/src/components/v3/recently-deleted-card.tsx`
- Modify: `apps/web/src/app/dashboard/players/[id]/page.tsx`

- [ ] **Step 1: Create the trash card component**

```tsx
// apps/web/src/components/v3/recently-deleted-card.tsx
'use client';

// Athlete-page "Recently deleted" disclosure. Lists soft-deleted
// activity_logs + self-report sessions for this player and offers a
// Restore button per entry. Collapsed by default; renders nothing when
// the trash is empty. Restoring calls the restore endpoint, then fires
// onRestored so the page bumps its data signal (timeline + standings
// refresh) and reloads the trash list.

import { useEffect, useState, useCallback } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';

interface Props {
  playerId: number;
  refreshKey: number;      // bump to refetch the trash list (after a delete/restore)
  onRestored: () => void;  // page bumps dataTick so the other cards refresh
}

interface LogTrash { id: number; kind: string | null; description: string | null; logged_at: string; }
interface SessionTrash { session_id: string; label: string; date_sent: string; }

export function RecentlyDeletedCard({ playerId, refreshKey, onRestored }: Props) {
  const [logs, setLogs] = useState<LogTrash[]>([]);
  const [sessions, setSessions] = useState<SessionTrash[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [logRes, sessRes] = await Promise.all([
      fetch(`/api/activity-logs/trash?player_id=${playerId}`, { cache: 'no-store' }),
      fetch(`/api/self-report/trash?player_id=${playerId}`, { cache: 'no-store' }),
    ]);
    if (logRes.ok) {
      const { entries = [] } = (await logRes.json()) as { entries: LogTrash[] };
      setLogs(entries);
    }
    if (sessRes.ok) {
      const { sessions: s = [] } = (await sessRes.json()) as { sessions: SessionTrash[] };
      setSessions(s);
    }
  }, [playerId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const count = logs.length + sessions.length;
  if (count === 0) return null;

  async function restoreLog(id: number) {
    setBusy(`log:${id}`);
    const r = await fetch(`/api/activity-logs/${id}/restore`, { method: 'POST' });
    setBusy(null);
    if (r.ok) { onRestored(); load(); }
  }

  async function restoreSession(sessionId: string) {
    setBusy(`msg:${sessionId}`);
    const r = await fetch(
      `/api/self-report/${encodeURIComponent(sessionId)}/restore`,
      { method: 'POST' },
    );
    setBusy(null);
    if (r.ok) { onRestored(); load(); }
  }

  return (
    <section className="rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-6 py-4 text-left"
      >
        <Trash2 className="size-4" style={{ color: 'var(--ink-mute)' }} />
        <h2 className="text-base font-bold text-[color:var(--ink)]">Recently deleted ({count})</h2>
        <span className="ml-auto text-[12px] text-[color:var(--ink-mute)]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul className="border-t" style={{ borderColor: 'var(--border)' }}>
          {logs.map((l) => (
            <li
              key={`log:${l.id}`}
              className="flex items-center gap-4 px-6 py-3 border-b last:border-b-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-[color:var(--ink)]">
                  {l.kind ?? 'activity'}{l.description ? ` — ${l.description}` : ''}
                </div>
                <div className="text-[11px] text-[color:var(--ink-mute)]">{l.logged_at.slice(0, 10)}</div>
              </div>
              <button
                onClick={() => restoreLog(l.id)}
                disabled={busy === `log:${l.id}`}
                className="flex items-center gap-1 text-[12px] text-[color:var(--blue)] hover:underline disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" /> Restore
              </button>
            </li>
          ))}
          {sessions.map((s) => (
            <li
              key={`msg:${s.session_id}`}
              className="flex items-center gap-4 px-6 py-3 border-b last:border-b-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-[color:var(--ink)]">{s.label}</div>
                <div className="text-[11px] text-[color:var(--ink-mute)]">{s.date_sent.slice(0, 10)}</div>
              </div>
              <button
                onClick={() => restoreSession(s.session_id)}
                disabled={busy === `msg:${s.session_id}`}
                className="flex items-center gap-1 text-[12px] text-[color:var(--blue)] hover:underline disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" /> Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Import the card and add a `canManageEntries` memo**

In `players/[id]/page.tsx`, add to the import block:
```ts
import { RecentlyDeletedCard } from '@/components/v3/recently-deleted-card';
```

Then refactor the existing `canDelete` so the boolean is reusable (the current `canDelete` already ignores its `_entry` argument). Replace the existing `canDelete` useCallback with:

```tsx
  const canManageEntries = useMemo((): boolean => {
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
  }, [player, prefs]);

  const canDelete = useCallback(
    (_entry: TimelineEntry): boolean => canManageEntries,
    [canManageEntries],
  );
```

(`useMemo` and `useCallback` are already imported on line 2.)

- [ ] **Step 3: Render the card below the timeline**

In `players/[id]/page.tsx`, immediately after the closing `/>` of `<UnifiedTimeline ... />` and before the closing `</main>`, add:

```tsx
        {canManageEntries && (
          <RecentlyDeletedCard
            playerId={player.id}
            refreshKey={dataTick}
            onRestored={() => setDataTick((n) => n + 1)}
          />
        )}
```

- [ ] **Step 4: Typecheck + lint + build**

Run:
```bash
bun run typecheck && bun run lint && bun run build:web
```
Expected: all clean/succeed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/v3/recently-deleted-card.tsx apps/web/src/app/dashboard/players/[id]/page.tsx
git commit -m "feat(web): recently-deleted trash card with restore on athlete page"
```

---

## Task 8: Full verification + push

**Files:** none (verification only)

- [ ] **Step 1: Run the full definition-of-done**

Run:
```bash
bun run typecheck && bun run lint && bun run build:web
```
Expected: all three green. Do not proceed if any fail.

- [ ] **Step 2: Manual round-trip in the running app**

Run `bun run dev:web`, open an athlete page where you have an active competition and at least one scored entry, then verify each:
1. Delete an activity-log entry from the timeline → it disappears from the timeline **and** the "Active competitions" points/rank update **without a page refresh** → an "Entry deleted · Undo" toast appears.
2. Click **Undo** → the entry reappears in the timeline and the competition points/rank revert.
3. Delete it again, let the toast expire → expand **"Recently deleted (n)"** below the timeline → the entry is listed → click **Restore** → it reappears in the timeline/standings and drops off the trash list.
4. Repeat 1–3 for a **self-report** entry (the kind with a `session_id`); confirm the whole session restores together.
5. Trigger a delete failure path if feasible (e.g. offline) → confirm the row snaps back and an error toast shows.

- [ ] **Step 3: Push**

```bash
git push
```
Vercel auto-deploys. Note in the PR/commit summary that **no migration is required** (reuses existing `hidden` columns).

---

## Self-review notes (author)

- **Spec coverage:** Part A → Tasks 5 (+6 bumps `dataTick`); Part B → Tasks 1, 6; Part C → Tasks 2, 3, 4, 7. All spec sections mapped.
- **Cascade symmetry:** Task 3 restore mirrors the Task-described delete in `self-report/[sessionId]/route.ts` exactly (un-hide messages + `source_sid` activity_logs).
- **Naming consistency:** `refreshKey` prop used in both the competition card (Task 5) and trash card (Task 7); `canManageEntries` defined once (Task 7) and reused by `canDelete`. Response keys: `{ entries }` (activity-logs trash), `{ sessions }` (self-report trash) — matched by the card's fetch in Task 7. The self-report trash card destructures `sessions: s` to avoid shadowing the `sessions` state.
- **No placeholders:** every code step is complete and copy-pasteable.
