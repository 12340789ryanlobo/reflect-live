# Membership Foundation — Phase 1d (Team Creation + Admin Panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Coaches can self-service create a team. Platform admins see every team in one panel and can freeze/unfreeze/delete. The global `require_team_approval` toggle gates whether new teams go live immediately or sit in `pending` for admin approval.

**Architecture:** The existing admin-only `POST /api/teams` opens up to any signed-in user — it auto-generates a `team_code` from the helper shipped in 1a, sets `creation_status` based on `platform_settings.require_team_approval`, and atomically creates the creator's `team_memberships` row at `role=coach, status=active`. A new `PATCH /api/teams/[id]` endpoint handles freeze/unfreeze; a new `DELETE` handles hard delete. A new `/api/platform-settings` exposes the toggle. The existing `/dashboard/admin/teams` page extends with new columns and actions; a new `/dashboard/team/new` page is the coach-facing creation form.

**Tech Stack:** Next.js App Router, Clerk auth, Supabase (service-role for writes), Tailwind/shadcn, the `generateTeamCode` helper from `@reflect-live/shared`.

---

## File Structure

**Files to create:**
- `apps/web/src/app/api/teams/[id]/route.ts` — PATCH (freeze/unfreeze + admin-only edits) and DELETE
- `apps/web/src/app/api/platform-settings/route.ts` — GET + PATCH the require_team_approval toggle
- `apps/web/src/app/dashboard/team/new/page.tsx` — coach self-service team creation form
- `apps/web/src/lib/admin-guard.ts` — small helper to check `is_platform_admin` (used by 3+ routes)

**Files to modify:**
- `apps/web/src/app/api/teams/route.ts` — open POST to any signed-in user; auto-generate team_code; honor require_team_approval; create coach membership; update requireAdmin to accept either legacy role='admin' OR new is_platform_admin
- `apps/web/src/app/dashboard/admin/teams/page.tsx` — show creation_status + team_code + member count; freeze/unfreeze + delete actions; require_team_approval toggle

---

## Task 1: admin-guard helper

**Files:**
- Create: `apps/web/src/lib/admin-guard.ts`

A small utility used by /api/teams, /api/teams/[id], /api/platform-settings to check that the caller is a platform admin. Reads `is_platform_admin` from `user_preferences`. Exists so we don't repeat the same auth boilerplate in three places.

- [ ] **Step 1: Create the helper**

Create `apps/web/src/lib/admin-guard.ts`:

```ts
// Server-side helper. Resolves whether the calling Clerk user is a
// platform admin (is_platform_admin=true on user_preferences). Returns
// either the userId for downstream use, or a NextResponse error to
// short-circuit the route.
//
// Service-role Supabase client is created internally because callers
// don't need it before this check passes anyway.

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export type AdminGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requirePlatformAdmin(): Promise<AdminGuardResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await sb
    .from('user_preferences')
    .select('is_platform_admin, role')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean; role: string | null }>();
  // Also accept legacy role='admin' for backward compat during transition.
  const isAdmin = data?.is_platform_admin === true || data?.role === 'admin';
  if (!isAdmin) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live
git add apps/web/src/lib/admin-guard.ts
git commit -m "feat(web): requirePlatformAdmin helper

Server-side gate used by /api/teams, /api/teams/[id], and
/api/platform-settings. Accepts either is_platform_admin=true
(new flag) or legacy role='admin' so existing admin routes keep
working through the transition."
```

---

## Task 2: open POST /api/teams to coach self-service

**Files:**
- Modify: `apps/web/src/app/api/teams/route.ts`

The existing POST is admin-only. Open it to any signed-in user. Behavior:
- Validate name + default_gender; auto-generate team_code via `generateTeamCode()` (retry on rare collision).
- Read `platform_settings.require_team_approval`. If true, the new team's `creation_status='pending'`. Otherwise `'active'`.
- Insert the team + the creator's `team_memberships` row at `role='coach', status='active', default_team=<true if first active>`.

GET stays admin-only (uses requirePlatformAdmin from Task 1).

PATCH stays admin-only too (legacy edit-twilio-fields path); we leave it alone.

- [ ] **Step 1: Replace the file**

Open `apps/web/src/app/api/teams/route.ts` and replace its contents with:

```ts
// /api/teams
//
// GET   — admin-only: list every team (any creation_status).
// POST  — any signed-in user: create a team. Auto-generates team_code,
//         honors platform_settings.require_team_approval, and atomically
//         creates the creator's coach membership.
// PATCH — admin-only: edit legacy team fields (name, description, twilio
//         credentials). Freeze/unfreeze and delete live on /api/teams/[id].

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { generateTeamCode, isValidTeamCode } from '@reflect-live/shared';
import { requirePlatformAdmin } from '@/lib/admin-guard';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const sb = serviceClient();
  const { data, error } = await sb.from('teams').select('*').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { name?: unknown; code?: unknown; team_code?: unknown; default_gender?: unknown; description?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });

  // Internal `code` is the legacy slug used by some routes; generate from name.
  const codeRaw = typeof body.code === 'string' ? body.code.trim() : '';
  const code = (codeRaw || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (!code) return NextResponse.json({ error: 'bad_code' }, { status: 400 });

  const defaultGender = body.default_gender === 'female' ? 'female' : 'male';
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;

  const sb = serviceClient();

  // Honor platform_settings.require_team_approval.
  const { data: settings } = await sb
    .from('platform_settings')
    .select('require_team_approval')
    .eq('id', 1)
    .maybeSingle<{ require_team_approval: boolean }>();
  const requireApproval = settings?.require_team_approval === true;

  // Reject if a team with the same legacy code already exists (unique constraint
  // would catch it but we want a friendlier error).
  const { data: codeClash } = await sb.from('teams').select('id').eq('code', code).maybeSingle();
  if (codeClash) return NextResponse.json({ error: 'code_taken' }, { status: 400 });

  // Generate a team_code (retry on rare collision).
  let teamCode: string | null = null;
  for (let i = 0; i < 5; i++) {
    const candidate = generateTeamCode();
    if (!isValidTeamCode(candidate)) continue;
    const { data: hit } = await sb
      .from('teams')
      .select('id')
      .eq('team_code', candidate)
      .maybeSingle();
    if (!hit) { teamCode = candidate; break; }
  }
  if (!teamCode) {
    return NextResponse.json({ error: 'team_code_generation_failed' }, { status: 500 });
  }

  const { data: team, error: tErr } = await sb
    .from('teams')
    .insert({
      name,
      code,
      description,
      team_code: teamCode,
      creation_status: requireApproval ? 'pending' : 'active',
      default_gender: defaultGender,
      scoring_json: { workout_score: 10, rehab_score: 5 },
      activity_visibility: 'public',
    })
    .select()
    .single();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  // Create the creator's coach membership. Flag default_team if this is
  // their first active row.
  const { count: existingActiveCount } = await sb
    .from('team_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('clerk_user_id', userId)
    .eq('status', 'active');
  const isFirstActive = (existingActiveCount ?? 0) === 0;

  // If the team is pending admin approval, the creator's membership stays
  // active anyway (so they can see/edit their own pending team while it
  // awaits approval). The team itself is just gated from athlete browse.
  const { error: mErr } = await sb.from('team_memberships').insert({
    clerk_user_id: userId,
    team_id: team.id,
    role: 'coach',
    status: 'active',
    default_team: isFirstActive,
    decided_at: new Date().toISOString(),
    decided_by: userId,
  });
  if (mErr) {
    // If membership insert fails, leave the team row in place but report
    // — admin can manually clean up. (Realistic alternative: wrap in a
    // pg function for transactional atomicity. Defer that polish.)
    return NextResponse.json({ error: 'membership_insert_failed', detail: mErr.message, team }, { status: 500 });
  }

  return NextResponse.json({ ok: true, team, requires_approval: requireApproval });
}

export async function PATCH(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const body = await req.json();
  const { id, ...patch } = body;
  if (typeof id !== 'number') return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sb = serviceClient();
  const allowed = ['name', 'description', 'twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number'];
  const filtered: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) filtered[k] = patch[k];
  const { error } = await sb.from('teams').update(filtered).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live
git add apps/web/src/app/api/teams/route.ts
git commit -m "feat(api): open POST /api/teams to coach self-service

Any signed-in user can create a team. Auto-generates team_code via
the @reflect-live/shared helper (retries on rare collision). Honors
platform_settings.require_team_approval — if on, new teams sit at
creation_status='pending' until admin approves. Creator gets a
team_memberships row at role='coach', status='active', and default
on if it's their first active membership.

GET + PATCH stay admin-only (now via the new requirePlatformAdmin
helper which accepts is_platform_admin=true or legacy role='admin')."
```

---

## Task 3: PATCH + DELETE /api/teams/[id]

**Files:**
- Create: `apps/web/src/app/api/teams/[id]/route.ts`

PATCH handles `creation_status` flips (freeze, unfreeze, approve a pending team). DELETE hard-deletes.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/teams/[id]/route.ts`:

```ts
// PATCH /api/teams/:id   — admin: freeze, unfreeze, approve pending team
// DELETE /api/teams/:id  — admin: hard delete (cascades RLS-protected)
//
// Per-id endpoint complements /api/teams (GET list + POST create). The
// status transitions live here so the route signature stays simple
// (one body verb per request).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin } from '@/lib/admin-guard';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: { action?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const action = body.action;

  let nextStatus: 'pending' | 'active' | 'suspended';
  if (action === 'freeze') nextStatus = 'suspended';
  else if (action === 'unfreeze' || action === 'approve') nextStatus = 'active';
  else if (action === 'reset_pending') nextStatus = 'pending';
  else return NextResponse.json({ error: 'bad_action' }, { status: 400 });

  const sb = serviceClient();
  const { data, error } = await sb
    .from('teams')
    .update({ creation_status: nextStatus })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, team: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const sb = serviceClient();
  // Defensive: deleting a team will fail if memberships/sessions/etc reference
  // it (FK on referenced tables). For now we surface that error rather than
  // pre-cleaning, so admin sees something explicit and can decide.
  const { error } = await sb.from('teams').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live
git add apps/web/src/app/api/teams/\[id\]/route.ts
git commit -m "feat(api): PATCH/DELETE /api/teams/[id] for admin lifecycle

PATCH actions:
  - freeze         creation_status → suspended
  - unfreeze       creation_status → active
  - approve        creation_status → active (used when require_team_approval is on)
  - reset_pending  creation_status → pending

DELETE: hard delete. FK violations on referencing tables surface as
explicit errors so admin sees what's blocking; no pre-cleanup yet."
```

---

## Task 4: GET + PATCH /api/platform-settings

**Files:**
- Create: `apps/web/src/app/api/platform-settings/route.ts`

GET returns the singleton row (admin only). PATCH flips `require_team_approval`.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/platform-settings/route.ts`:

```ts
// GET  /api/platform-settings — admin: read singleton config
// PATCH /api/platform-settings — admin: update the toggle(s)
//
// Currently only require_team_approval. Future toggles can land here
// without route churn.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin } from '@/lib/admin-guard';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const sb = serviceClient();
  const { data, error } = await sb
    .from('platform_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PATCH(req: NextRequest) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  let body: { require_team_approval?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const update: Record<string, unknown> = {};
  if (typeof body.require_team_approval === 'boolean') {
    update.require_team_approval = body.require_team_approval;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data, error } = await sb
    .from('platform_settings')
    .update(update)
    .eq('id', 1)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live
git add apps/web/src/app/api/platform-settings/route.ts
git commit -m "feat(api): /api/platform-settings GET + PATCH

Singleton row at id=1. Currently only require_team_approval is
mutable. Future global toggles can land here without route churn."
```

---

## Task 5: Coach team-creation form

**Files:**
- Create: `apps/web/src/app/dashboard/team/new/page.tsx`

Simple form: name + default_gender + description (optional). Submit POSTs to /api/teams. On success, if the team is `active`, the creator becomes coach immediately and we redirect to /dashboard. If `pending`, we show an "awaiting admin approval" state.

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/dashboard/team/new/page.tsx`:

```tsx
'use client';

// Coach self-service team creation. POSTs /api/teams. On success:
//   - require_team_approval=false → team is active, creator is coach.
//     Redirect to /dashboard which will pick up the new membership.
//   - require_team_approval=true → team is pending. Show success card
//     with awaiting-approval state. Creator can still see the team in
//     their team switcher (sub-2) since their membership is active.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export default function NewTeamPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [defaultGender, setDefaultGender] = useState<'male' | 'female'>('male');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [pendingState, setPendingState] = useState<{ teamName: string } | null>(null);

  async function submit() {
    setSubmitting(true); setErrMsg(null);
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        default_gender: defaultGender,
        description: description.trim() || null,
      }),
    });
    setSubmitting(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrMsg(
        j.error === 'code_taken' ? 'A team with a similar name already exists. Try another name.'
        : j.error === 'name_required' ? 'Name is required.'
        : j.error === 'name_too_long' ? 'Name is too long.'
        : (j.error ?? 'Could not create team.'),
      );
      return;
    }
    if (j.requires_approval) {
      setPendingState({ teamName: j.team?.name ?? name });
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  if (pendingState) {
    return (
      <>
        <PageHeader eyebrow="Team" title="Awaiting approval" />
        <main className="px-6 py-10">
          <section
            className="mx-auto max-w-[480px] rounded-2xl bg-[color:var(--card)] border px-6 py-8 text-center"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2 className="text-[18px] font-bold text-[color:var(--ink)]">
              {pendingState.teamName} is awaiting platform admin approval
            </h2>
            <p className="mt-2 text-[13px] text-[color:var(--ink-mute)]">
              You&rsquo;ll be able to invite athletes and start using the team once an
              admin approves it. We&rsquo;ll surface a notification when that happens.
            </p>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Team" title="Create a team" />
      <main className="px-6 py-6">
        <section
          className="mx-auto max-w-[480px] rounded-2xl bg-[color:var(--card)] border p-6 space-y-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="t-name">Team name</label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. UChicago Men&rsquo;s Swim"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="t-gender">Default heatmap figure</label>
            <Select value={defaultGender} onValueChange={(v) => setDefaultGender(v as 'male' | 'female')}>
              <SelectTrigger id="t-gender"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="t-desc">Description (optional)</label>
            <Input
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything you want athletes to see when they find your team."
            />
          </div>
          {errMsg && <p className="text-[12.5px] text-[color:var(--red)]">{errMsg}</p>}
          <div className="flex justify-end pt-2">
            <Button onClick={submit} disabled={!name.trim() || submitting}>
              {submitting ? 'Creating…' : 'Create team'}
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live
git add apps/web/src/app/dashboard/team/new/page.tsx
git commit -m "feat(dashboard): /dashboard/team/new coach team-creation form

Name + default-gender + optional description. POSTs /api/teams.
On success: if team is active, redirect to /dashboard (the new
membership picks up there). If require_team_approval is on, the
team sits in pending and the page shows an awaiting-approval card.

Entry point will be wired in sub-2 (team switcher) where
'Create another team' becomes a natural action."
```

---

## Task 6: Extend admin all-teams panel

**Files:**
- Modify: `apps/web/src/app/dashboard/admin/teams/page.tsx`

Add columns for `creation_status`, `team_code`, member count. Add freeze/unfreeze + delete actions. Add a top-of-page toggle for `require_team_approval`.

- [ ] **Step 1: Replace the file**

Open `apps/web/src/app/dashboard/admin/teams/page.tsx` and replace its contents with:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { Pill } from '@/components/v3/pill';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { prettyDate } from '@/lib/format';
import type { TeamCreationStatus } from '@reflect-live/shared';

interface TeamRow {
  id: number;
  name: string;
  code: string;
  team_code: string | null;
  description: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  creation_status: TeamCreationStatus;
  default_gender: string | null;
  created_at: string;
  member_count?: number;
}

const STATUS_TONE: Record<TeamCreationStatus, 'green' | 'amber' | 'red'> = {
  active: 'green',
  pending: 'amber',
  suspended: 'red',
};

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [requireApproval, setRequireApproval] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null);

  async function load() {
    setLoading(true);
    const [teamsRes, settingsRes] = await Promise.all([
      fetch('/api/teams'),
      fetch('/api/platform-settings'),
    ]);
    if (teamsRes.ok) {
      const j = await teamsRes.json();
      const list = (j.teams ?? []) as TeamRow[];

      // Pull active member counts in one extra fetch (per-team count via the
      // memberships query; trivial scale for an admin page).
      const counts = await Promise.all(
        list.map(async (t) => {
          const r = await fetch(`/api/teams/${t.id}/requests`);
          // Note: requests endpoint is pending-only. For active counts we'd
          // need another endpoint; defer to a later polish, surface request
          // count alongside status today.
          let pending = 0;
          if (r.ok) {
            const rj = await r.json();
            pending = (rj.requests ?? []).length;
          }
          return { id: t.id, member_count: pending };
        }),
      );
      const byId = new Map(counts.map((c) => [c.id, c.member_count]));
      setTeams(list.map((t) => ({ ...t, member_count: byId.get(t.id) ?? 0 })));
    }
    if (settingsRes.ok) {
      const sj = await settingsRes.json();
      setRequireApproval(sj.settings?.require_team_approval === true);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setApproval(next: boolean) {
    setRequireApproval(next);
    await fetch('/api/platform-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ require_team_approval: next }),
    });
  }

  async function lifecycle(team: TeamRow, action: 'freeze' | 'unfreeze' | 'approve') {
    setBusyId(team.id);
    const res = await fetch(`/api/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (res.ok) await load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const res = await fetch(`/api/teams/${deleteTarget.id}`, { method: 'DELETE' });
    setBusyId(null);
    setDeleteTarget(null);
    if (res.ok) await load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Teams"
        subtitle={loading ? '— loading —' : `${teams.length} teams registered`}
      />
      <main className="px-6 py-4 space-y-6">
        <section
          className="rounded-2xl bg-[color:var(--card)] border p-5 flex items-center justify-between gap-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <p className="text-[13.5px] font-semibold text-[color:var(--ink)]">Require admin approval for new teams</p>
            <p className="text-[12px] text-[color:var(--ink-mute)]">
              When on, coaches who create a team via the self-service form land in pending
              until you approve. Off by default — most teams should self-serve.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setApproval(e.target.checked)}
              className="size-4"
            />
            {requireApproval ? 'On' : 'Off'}
          </label>
        </section>

        <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header
            className="flex items-center justify-between gap-3 px-6 py-4 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2 className="text-base font-bold text-[color:var(--ink)]">All teams</h2>
            <span className="text-[11.5px] text-[color:var(--ink-mute)]">{teams.length}</span>
          </header>
          {loading ? (
            <p className="px-6 py-10 text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
          ) : teams.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-[color:var(--ink-mute)]">
              No teams yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {teams.map((t) => (
                <li key={t.id} className="px-6 py-3.5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-[color:var(--ink)]">{t.name}</span>
                      <Pill tone={STATUS_TONE[t.creation_status]}>{t.creation_status}</Pill>
                      {t.team_code && (
                        <span className="text-[11.5px] text-[color:var(--ink-mute)] mono">
                          code: <span className="font-semibold">{t.team_code}</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-[color:var(--ink-mute)]">
                      {t.description ?? <span className="italic">no description</span>}
                    </p>
                    <p className="mt-1 mono text-[11px] text-[color:var(--ink-mute)] tabular">
                      created {prettyDate(t.created_at)}
                      {(t.member_count ?? 0) > 0 && <> · {t.member_count} pending request{t.member_count === 1 ? '' : 's'}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.creation_status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => lifecycle(t, 'approve')}
                        disabled={busyId === t.id}
                      >
                        Approve
                      </Button>
                    )}
                    {t.creation_status === 'active' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => lifecycle(t, 'freeze')}
                        disabled={busyId === t.id}
                        className="text-[color:var(--ink-mute)] hover:text-[color:var(--amber)]"
                      >
                        Freeze
                      </Button>
                    )}
                    {t.creation_status === 'suspended' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => lifecycle(t, 'unfreeze')}
                        disabled={busyId === t.id}
                      >
                        Unfreeze
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(t)}
                      disabled={busyId === t.id}
                      className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)]"
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This is permanent. Memberships, sessions, and other rows referencing
              this team will block the delete unless you remove them first. Use
              Freeze if you just want to hide the team.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={busyId === deleteTarget?.id}>
              {busyId === deleteTarget?.id ? 'Deleting…' : 'Delete team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit + push**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live
git add apps/web/src/app/dashboard/admin/teams/page.tsx
git commit -m "feat(admin): all-teams panel — status, code, lifecycle actions, approval toggle

Adds:
  - creation_status pill (active/pending/suspended) per team
  - team_code displayed inline
  - pending request count shown alongside created_at
  - Approve / Freeze / Unfreeze / Delete actions per row
  - Top-of-page require_team_approval toggle (PATCH /api/platform-settings)
  - Delete dialog warns about FK violations and suggests Freeze instead

Replaces the legacy admin-only team-edit dialog with the lifecycle
actions; legacy edit-twilio-fields still lives in /api/teams PATCH
and can be re-surfaced as needed in a follow-up."
git push
```

---

## What 1d delivers

After this plan ships:
- A coach can navigate to `/dashboard/team/new`, fill in a name + default gender, and create a new team. They become the team's coach immediately (or land in pending if `require_team_approval=true`).
- The platform admin (`/dashboard/admin/teams`) sees every team with status, team_code, and pending-request count. Can approve pending teams, freeze active ones, unfreeze suspended ones, or delete (with FK guard).
- The toggle at the top of the admin panel flips global approval-gating behavior on the fly.

The men's/women's swim split now becomes trivial: visit `/dashboard/team/new` twice, name them "UChicago Men's Swim" and "UChicago Women's Swim", and we have two teams ready for athletes to find.

## Out of scope (1e or later)

- Decision SMS notifications when admin approves/denies a team
- Sidebar entry point for "Create another team" (lands naturally with sub-2 team switcher)
- Active member count on the admin all-teams panel (current row shows pending request count; full active count is a separate query)
- Pre-cleanup before delete (cascade to memberships/sessions/etc.)
