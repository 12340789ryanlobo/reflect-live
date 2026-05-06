# Membership Foundation — Phase 1c (Coach Approval Inbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Coaches and captains can see pending join requests on their team, approve them (which creates the `players` row and flips the membership to `active`), or deny them with an optional reason. The athlete's pending banner from phase 1b auto-flips via realtime when the coach acts.

**Architecture:** A small migration adds `requested_phone` to `team_memberships` so the request form can carry a phone (needed because `players.phone_e164` is `not null`). Two new API endpoints (`GET /api/teams/[id]/requests`, `PATCH /api/teams/[id]/requests/[clerkUserId]`) sit alongside the athlete-side endpoints from 1b. A new `/dashboard/requests` page lists pending rows with approve/deny actions. The sidebar gains a "Requests" entry with a count badge.

**Tech Stack:** Same as 1b — Next.js App Router, Clerk auth, Supabase (service-role for writes), Tailwind/shadcn.

---

## File Structure

**Files to create:**
- `supabase/migrations/0016_request_phone.sql` — adds `requested_phone` column
- `apps/web/src/app/api/teams/[id]/requests/route.ts` — GET pending requests for a team
- `apps/web/src/app/api/teams/[id]/requests/[clerkUserId]/route.ts` — PATCH approve/deny
- `apps/web/src/app/dashboard/requests/page.tsx` — coach inbox UI

**Files to modify:**
- `apps/web/src/app/api/team-memberships/route.ts` — accept + store `phone` field
- `apps/web/src/app/onboarding/page.tsx` — add phone input field
- `apps/web/src/components/app-sidebar.tsx` — add Requests entry with count badge

---

## Task 1: Migration 0016 — add requested_phone column

**Files:**
- Create: `supabase/migrations/0016_request_phone.sql`

The athlete needs to provide a phone in the request so we can create a `players` row on approval (`players.phone_e164` is `not null`).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0016_request_phone.sql`:

```sql
-- Phase 1c — add requested_phone to team_memberships.
--
-- Athletes provide a phone with their join request so that on approval
-- the coach can create a players row (players.phone_e164 is NOT NULL).
-- Existing rows (backfilled from user_preferences in 0015) keep null
-- since their player_id was already wired up in the migration.

alter table team_memberships add column if not exists requested_phone text;
```

- [ ] **Step 2: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add supabase/migrations/0016_request_phone.sql
git commit -m "feat(db): add requested_phone to team_memberships for coach approval

Phase 1c needs phone at approval time to create the players row.
Nullable so backfilled rows from 0015 remain valid."
```

- [ ] **Step 3: User applies the migration**

Open the migration file, copy contents, paste into Supabase SQL editor, run. Should report success.

(Defer the rest of the tasks until the migration lands — they reference the new column.)

---

## Task 2: Accept + store phone in POST /api/team-memberships

**Files:**
- Modify: `apps/web/src/app/api/team-memberships/route.ts`

- [ ] **Step 1: Add phone validation + storage**

Open `apps/web/src/app/api/team-memberships/route.ts`. Find the `POST` handler. Add phone parsing alongside name + email and store it in `requested_phone`.

Replace the body destructure block plus the validation + insert:

```ts
  let body: { team_id?: unknown; name?: unknown; email?: unknown; phone?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const teamId = Number(body.team_id);
  if (!Number.isInteger(teamId)) {
    return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });

  // Light phone normalization — strip whitespace and dashes; keep leading '+'.
  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = phoneRaw.replace(/[\s\-().]/g, '');
  if (!phone) return NextResponse.json({ error: 'phone_required' }, { status: 400 });
  if (!/^\+?\d{7,15}$/.test(phone)) {
    return NextResponse.json({ error: 'bad_phone' }, { status: 400 });
  }

  let email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email) {
    const u = await currentUser();
    email = u?.primaryEmailAddress?.emailAddress ?? '';
  }
```

Then in the insert call, add `requested_phone: phone`:

```ts
  const { data, error } = await sb
    .from('team_memberships')
    .insert({
      clerk_user_id: userId,
      team_id: teamId,
      role: 'athlete',
      status: 'requested',
      default_team: false,
      requested_name: name,
      requested_email: email || null,
      requested_phone: phone,
      requested_at: now,
    })
    .select()
    .single();
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Update shared TeamMembership type to include requested_phone**

Open `packages/shared/src/types.ts`. Find `TeamMembership` interface. Add `requested_phone: string | null;` after `requested_email`.

- [ ] **Step 4: Re-typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/packages/shared && bunx tsc --noEmit
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/web && bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add apps/web/src/app/api/team-memberships/route.ts packages/shared/src/types.ts
git commit -m "feat(api): accept + store requested_phone on join request

Athlete provides phone in the request form. Stored on the
team_memberships row as requested_phone so approval can pick it up
and create a players row (which requires phone_e164 NOT NULL)."
```

---

## Task 3: Add phone input to onboarding form

**Files:**
- Modify: `apps/web/src/app/onboarding/page.tsx`

- [ ] **Step 1: Add the phone state + input**

Open `apps/web/src/app/onboarding/page.tsx`. Add a new state hook near the existing `name` and `email` hooks:

```ts
  const [phone, setPhone] = useState('');
```

Then near the existing `useEffect` that pre-fills name/email from Clerk, extend it to also pre-fill phone if Clerk has one verified:

```ts
  useEffect(() => {
    if (!user) return;
    if (!name) setName(user.fullName ?? user.firstName ?? '');
    if (!email) setEmail(user.primaryEmailAddress?.emailAddress ?? '');
    if (!phone) {
      const verifiedPhone = user.phoneNumbers?.find((p) => p.verification?.status === 'verified');
      if (verifiedPhone) setPhone(verifiedPhone.phoneNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
```

Inside the "Requesting to join" card section (where the name + email fields live), add a phone field after email:

```tsx
                  <div className="grid gap-1.5">
                    <label className="text-[11.5px] font-semibold text-[color:var(--ink)]" htmlFor="phone">Phone</label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 555 555 5555"
                      autoComplete="tel"
                    />
                    <p className="text-[11px] text-[color:var(--ink-mute)]">
                      So your coach can reach you and link you to surveys.
                    </p>
                  </div>
```

Update the submit handler to include phone:

```ts
    const res = await fetch('/api/team-memberships', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: selectedTeam.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      }),
    });
```

Update the disabled state of the submit button to require phone:

```tsx
              <Button
                onClick={submit}
                disabled={!selectedTeam || !name.trim() || !phone.trim() || submitting}
                ...
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add apps/web/src/app/onboarding/page.tsx
git commit -m "feat(onboarding): collect phone in join request form

Phone is required for the coach to create a players row on approval.
Pre-fills from Clerk if the user has a verified phone; otherwise
the athlete types it. tel input + autoComplete='tel' for mobile UX."
```

---

## Task 4: API — GET /api/teams/[id]/requests

**Files:**
- Create: `apps/web/src/app/api/teams/[id]/requests/route.ts`

Returns pending requests on a team. Caller must be coach/captain on that team OR platform admin.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/teams/[id]/requests/route.ts`:

```ts
// GET /api/teams/:id/requests
//
// Lists pending join requests (status='requested') for the team. Caller
// must be a coach or captain on that team, OR platform admin. Returns
// the data the inbox needs to render — name, email, phone, requested_at.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: teamIdStr } = await ctx.params;
  const teamId = Number(teamIdStr);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });

  const sb = serviceClient();

  // Authorize: caller must be active coach/captain on this team or platform admin.
  const { data: callerMembership } = await sb
    .from('team_memberships')
    .select('role, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle<{ role: string; status: string }>();

  const { data: prefs } = await sb
    .from('user_preferences')
    .select('is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean }>();

  const isManager =
    callerMembership?.status === 'active' &&
    (callerMembership.role === 'coach' || callerMembership.role === 'captain');
  const isPlatformAdmin = prefs?.is_platform_admin === true;
  if (!isManager && !isPlatformAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data, error } = await sb
    .from('team_memberships')
    .select('clerk_user_id, team_id, requested_name, requested_email, requested_phone, requested_at, status')
    .eq('team_id', teamId)
    .eq('status', 'requested')
    .order('requested_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add apps/web/src/app/api/teams/\[id\]/requests/route.ts
git commit -m "feat(api): GET /api/teams/[id]/requests — coach inbox listing

Returns pending join requests for a team. Caller must be active
coach/captain on the team or platform admin. Each row includes
the data the inbox UI renders: name, email, phone, requested_at."
```

---

## Task 5: API — PATCH /api/teams/[id]/requests/[clerkUserId]

**Files:**
- Create: `apps/web/src/app/api/teams/[id]/requests/[clerkUserId]/route.ts`

Approve or deny a single pending request. On approve, also creates a `players` row and flips the membership to `active` with `player_id` linked.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/teams/[id]/requests/[clerkUserId]/route.ts`:

```ts
// PATCH /api/teams/:id/requests/:clerkUserId
//
// body: { action: 'approve' | 'deny', reason?: string }
//
// On approve:
//   1. Insert a fresh players row with the request's name+phone+team.
//   2. Update the team_membership row: status='active', player_id=<new>,
//      decided_at=now(), decided_by=<approver>.
// On deny:
//   1. Update the team_membership row: status='denied',
//      deny_reason=<reason or null>, decided_at=now(), decided_by=<approver>.
//
// Decision SMS (1e) keys off the realtime change to the row.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; clerkUserId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: teamIdStr, clerkUserId } = await ctx.params;
  const teamId = Number(teamIdStr);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });
  if (!clerkUserId) return NextResponse.json({ error: 'bad_user_id' }, { status: 400 });

  let body: { action?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const action = body.action;
  if (action !== 'approve' && action !== 'deny') {
    return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null;

  const sb = serviceClient();

  // Authorize: caller must be active coach/captain on this team or platform admin.
  const { data: callerMembership } = await sb
    .from('team_memberships')
    .select('role, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle<{ role: string; status: string }>();
  const { data: prefs } = await sb
    .from('user_preferences')
    .select('is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean }>();
  const isManager =
    callerMembership?.status === 'active' &&
    (callerMembership.role === 'coach' || callerMembership.role === 'captain');
  const isPlatformAdmin = prefs?.is_platform_admin === true;
  if (!isManager && !isPlatformAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Load the request row.
  const { data: request } = await sb
    .from('team_memberships')
    .select('clerk_user_id, team_id, status, requested_name, requested_phone, requested_email')
    .eq('clerk_user_id', clerkUserId)
    .eq('team_id', teamId)
    .maybeSingle<{
      status: string;
      requested_name: string | null;
      requested_phone: string | null;
      requested_email: string | null;
    }>();
  if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (request.status !== 'requested') {
    return NextResponse.json(
      { error: 'wrong_status', actual: request.status },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  if (action === 'deny') {
    const { data, error } = await sb
      .from('team_memberships')
      .update({
        status: 'denied',
        deny_reason: reason,
        decided_at: now,
        decided_by: userId,
      })
      .eq('clerk_user_id', clerkUserId)
      .eq('team_id', teamId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, membership: data });
  }

  // approve: create the players row first.
  if (!request.requested_name || !request.requested_phone) {
    return NextResponse.json({ error: 'request_missing_name_or_phone' }, { status: 400 });
  }

  // Defensive: if a players row already exists with this phone on this team
  // (e.g. coach pre-rostered them but the auto-link missed for some reason),
  // re-use it. Otherwise create a new one.
  const { data: existingPlayer } = await sb
    .from('players')
    .select('id')
    .eq('team_id', teamId)
    .eq('phone_e164', request.requested_phone)
    .maybeSingle<{ id: number }>();

  let playerId: number;
  if (existingPlayer) {
    playerId = existingPlayer.id;
  } else {
    const { data: created, error: insErr } = await sb
      .from('players')
      .insert({
        team_id: teamId,
        name: request.requested_name,
        phone_e164: request.requested_phone,
        active: true,
      })
      .select('id')
      .single();
    if (insErr) {
      return NextResponse.json({ error: 'player_insert_failed', detail: insErr.message }, { status: 500 });
    }
    playerId = created.id as number;
  }

  // Flip the membership to active and link the player. If this is the
  // user's first active membership, also flag default_team=true.
  const { count: existingActiveCount } = await sb
    .from('team_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('clerk_user_id', clerkUserId)
    .eq('status', 'active');

  const isFirstActive = (existingActiveCount ?? 0) === 0;

  const { data, error } = await sb
    .from('team_memberships')
    .update({
      status: 'active',
      player_id: playerId,
      decided_at: now,
      decided_by: userId,
      default_team: isFirstActive,
    })
    .eq('clerk_user_id', clerkUserId)
    .eq('team_id', teamId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, membership: data, player_id: playerId });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add apps/web/src/app/api/teams/\[id\]/requests/\[clerkUserId\]/route.ts
git commit -m "feat(api): PATCH /api/teams/[id]/requests/[clerkUserId] approve/deny

action='approve':
  - creates a players row (or reuses existing if phone already on team)
  - flips membership status='active', sets player_id
  - flags default_team=true if this is the user's first active membership

action='deny':
  - sets status='denied', stores optional reason

Authorized for active coach/captain on the team or platform admin.
Decision SMS (1e) keys off the realtime change to the row."
```

---

## Task 6: Coach inbox UI — /dashboard/requests

**Files:**
- Create: `apps/web/src/app/dashboard/requests/page.tsx`

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/dashboard/requests/page.tsx`:

```tsx
'use client';

// Coach/captain inbox for pending join requests on the active team.
// Approve or deny one at a time. Approval creates a players row and
// flips the membership to active; the athlete's pending banner flips
// via realtime on the next render.

import { useCallback, useEffect, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Pill } from '@/components/v3/pill';
import { Check, X } from 'lucide-react';
import { relativeTime } from '@/lib/format';

interface RequestRow {
  clerk_user_id: string;
  team_id: number;
  requested_name: string | null;
  requested_email: string | null;
  requested_phone: string | null;
  requested_at: string;
}

export default function RequestsPage() {
  const { prefs, role } = useDashboard();
  const sb = useSupabase();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [denyTarget, setDenyTarget] = useState<RequestRow | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const canManage = role === 'coach' || role === 'captain' || role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/teams/${prefs.team_id}/requests`);
    if (r.ok) {
      const j = await r.json();
      setRows(j.requests ?? []);
    } else {
      setRows([]);
    }
    setLoading(false);
  }, [prefs.team_id]);

  useEffect(() => { load(); }, [load]);

  // Realtime: when membership rows on this team change, refresh.
  useEffect(() => {
    const channel = sb
      .channel(`team_requests_${prefs.team_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_memberships', filter: `team_id=eq.${prefs.team_id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [sb, prefs.team_id, load]);

  async function approve(req: RequestRow) {
    setActingOn(req.clerk_user_id);
    await fetch(`/api/teams/${prefs.team_id}/requests/${encodeURIComponent(req.clerk_user_id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    setActingOn(null);
    await load();
  }

  async function submitDeny() {
    if (!denyTarget) return;
    setActingOn(denyTarget.clerk_user_id);
    await fetch(`/api/teams/${prefs.team_id}/requests/${encodeURIComponent(denyTarget.clerk_user_id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'deny', reason: denyReason.trim() || null }),
    });
    setActingOn(null);
    setDenyTarget(null);
    setDenyReason('');
    await load();
  }

  if (!canManage) {
    return (
      <main className="px-6 py-12 text-center">
        <p className="text-[13px] text-[color:var(--ink-mute)]">
          Only coaches, captains, and admins can view pending requests.
        </p>
      </main>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title="Pending requests"
        subtitle={
          loading
            ? '— loading —'
            : rows.length === 0
              ? 'No pending requests'
              : `${rows.length} awaiting decision`
        }
      />
      <main className="px-6 pb-12 pt-4">
        <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          {loading ? (
            <p className="px-6 py-10 text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-[color:var(--ink-mute)]">
              No one is waiting. Athletes who request to join will show up here.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {rows.map((r) => (
                <li key={r.clerk_user_id} className="px-6 py-4 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-[color:var(--ink)]">
                        {r.requested_name ?? '—'}
                      </span>
                      <Pill tone="amber">pending</Pill>
                    </div>
                    <p className="mt-1 text-[12.5px] text-[color:var(--ink-soft)]">
                      {r.requested_phone && <span className="mono">{r.requested_phone}</span>}
                      {r.requested_phone && r.requested_email && <span className="mx-1.5 text-[color:var(--ink-mute)]">·</span>}
                      {r.requested_email && <span>{r.requested_email}</span>}
                    </p>
                    <p className="mt-1 mono text-[11px] text-[color:var(--ink-mute)] tabular">
                      requested {relativeTime(r.requested_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => approve(r)}
                      disabled={actingOn === r.clerk_user_id}
                      className="font-bold"
                    >
                      <Check className="size-4 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setDenyTarget(r); setDenyReason(''); }}
                      disabled={actingOn === r.clerk_user_id}
                      className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)]"
                    >
                      <X className="size-4 mr-1" /> Deny
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Dialog open={!!denyTarget} onOpenChange={(o) => { if (!o) setDenyTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny request from {denyTarget?.requested_name ?? '—'}?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <label className="text-[12.5px] font-semibold" htmlFor="deny-reason">Reason (optional)</label>
            <textarea
              id="deny-reason"
              rows={3}
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Sent to the athlete with the denial."
              className="rounded-md border bg-[color:var(--card)] px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--blue)]/40"
              style={{ borderColor: 'var(--border)' }}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setDenyTarget(null)}>Cancel</Button>
              <Button onClick={submitDeny} disabled={actingOn === denyTarget?.clerk_user_id}>
                {actingOn === denyTarget?.clerk_user_id ? 'Denying…' : 'Deny request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add apps/web/src/app/dashboard/requests/page.tsx
git commit -m "feat(dashboard): /dashboard/requests inbox for coach/captain

Lists pending join requests on the active team. Approve creates a
players row + flips membership to active. Deny opens a dialog for
an optional reason and flips status to denied. Realtime
subscription on team_memberships re-fetches when any membership
row on this team changes (so concurrent coach actions stay in
sync). Captain has same view as coach (per phase 1 spec scope C)."
```

---

## Task 7: Sidebar entry + count badge

**Files:**
- Modify: `apps/web/src/components/app-sidebar.tsx`

- [ ] **Step 1: Add the Requests entry to coach + captain navs**

Open `apps/web/src/components/app-sidebar.tsx`. Find the imports at the top, add `Inbox` to the lucide-react import (or pick another icon if `Inbox` clashes — `UserPlus` is a fine alternative).

Find `COACH_NAV` and `CAPTAIN_NAV`. Add a Requests entry to both. For the badge, the existing `NavItem` type doesn't carry a count — add an optional `badgeCount` field via a wrapper, OR fetch the count inside a small client component and render a badge inline.

Simplest: add a count fetcher inside the sidebar component itself (single subscription on team_memberships, count where status='requested'). Then pass the count via props to a special `NavItemWithBadge`.

Replace the navs and add the count fetcher:

```tsx
// Near the other lucide-react imports:
import { ..., UserPlus } from 'lucide-react';

// Add to COACH_NAV after Athletes (or wherever fits):
  { href: '/dashboard/requests', label: 'Requests', icon: UserPlus },
// And to CAPTAIN_NAV similarly.
```

(For badge count, the cleanest path is a small follow-up. Sidebar already does several things; adding a second realtime subscription here is reasonable but worth wrapping in its own hook later. For 1c, ship the link; the badge ships in 1e polish or a follow-up.)

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit + push**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add apps/web/src/components/app-sidebar.tsx
git commit -m "feat(sidebar): add Requests entry for coach + captain navs

Links to /dashboard/requests. Count badge ships in a follow-up
(needs its own realtime subscription wrapped as a hook to avoid
sidebar bloat)."
git push
```

---

## What 1c delivers

After this plan ships:
- Coaches and captains see `/dashboard/requests` with all pending requests on their team.
- Each row shows requester name, phone, email, and request age.
- Approve creates a `players` row and flips the membership to `active`.
- Deny captures an optional reason and flips to `denied`.
- The athlete's pending banner from 1b auto-flips via realtime on either decision.
- Captains have the same view as coaches (per spec scope C: approve/deny only).

The end-to-end loop now closes: athlete requests → coach approves → athlete lands on the dashboard.

## Out of scope (deferred to later phases)

- Decision SMS notification (1e) — realtime is wired but no outbound text yet.
- Multi-team team switcher (sub-2)
- Coach team-creation flow (1d)
- Admin all-teams panel (1d)
