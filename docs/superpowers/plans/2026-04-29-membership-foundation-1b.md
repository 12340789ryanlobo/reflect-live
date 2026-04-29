# Membership Foundation — Phase 1b (Athlete Request Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Athletes can find a team (browse list or paste code), submit a request to join, and see a "request pending" state until the coach decides. Approval handling lives in phase 1c — for 1b we just need the request to land cleanly and the athlete to see they're in the queue.

**Architecture:** New API endpoints under `/api/teams/discover` and `/api/team-memberships/*`. Existing `/onboarding/page.tsx` refactors from "pick team and you're in" to "pick team and request to join". A new `<PendingBanner />` renders when the user has memberships but none are active. The `dashboard-shell` learns to read `team_memberships` as the authoritative source for the user's team scope, falling back to `user_preferences.team_id` only for the legacy/derived "currently viewing" pointer.

**Tech Stack:** Next.js 16 App Router, Clerk auth, Supabase (service-role for writes, anon for client reads via RLS), Tailwind/shadcn for UI.

---

## File Structure

**Files to create:**
- `apps/web/src/app/api/teams/discover/route.ts` — GET browseable team list + lookup-by-code
- `apps/web/src/app/api/team-memberships/route.ts` — POST request to join, GET own memberships
- `apps/web/src/app/api/team-memberships/[teamId]/route.ts` — PATCH cancel pending request / leave team
- `apps/web/src/components/v3/pending-banner.tsx` — banner shown when user has only pending memberships
- `apps/web/src/lib/membership-state.ts` — pure helper that resolves "what's the user's current state?" given their memberships
- `apps/web/src/lib/membership-state.test.ts` — Vitest unit tests for the helper

**Files to modify:**
- `apps/web/src/app/onboarding/page.tsx` — change from immediate-join to request submission, add code-entry input
- `apps/web/src/components/dashboard-shell.tsx` — fetch memberships, derive scope, render banner when pending

---

## Task 1: Membership-state helper (TDD)

**Files:**
- Create: `apps/web/src/lib/membership-state.ts`
- Create: `apps/web/src/lib/membership-state.test.ts`

A pure function that takes the user's `TeamMembership[]` and returns one of: `no_memberships`, `pending_only`, `active`. Used by `dashboard-shell` to decide whether to render the banner / whether to redirect / what scope to apply.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/membership-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveMembershipState } from './membership-state';
import type { TeamMembership } from '@reflect-live/shared';

function mk(partial: Partial<TeamMembership>): TeamMembership {
  return {
    clerk_user_id: 'u1',
    team_id: 1,
    player_id: null,
    role: 'athlete',
    status: 'active',
    default_team: false,
    requested_name: null,
    requested_email: null,
    requested_at: '2026-04-29T00:00:00Z',
    decided_at: null,
    decided_by: null,
    deny_reason: null,
    ...partial,
  };
}

describe('resolveMembershipState', () => {
  it('returns no_memberships for an empty array', () => {
    expect(resolveMembershipState([])).toEqual({ kind: 'no_memberships' });
  });

  it('returns pending_only when only requested rows exist', () => {
    const r = resolveMembershipState([mk({ status: 'requested', team_id: 1 })]);
    expect(r.kind).toBe('pending_only');
    if (r.kind === 'pending_only') expect(r.pending).toHaveLength(1);
  });

  it('returns active when at least one membership is active', () => {
    const r = resolveMembershipState([
      mk({ status: 'active', team_id: 1, default_team: true }),
      mk({ status: 'requested', team_id: 2 }),
    ]);
    expect(r.kind).toBe('active');
    if (r.kind === 'active') {
      expect(r.activeTeamIds).toEqual([1]);
      expect(r.defaultTeamId).toBe(1);
      expect(r.pending).toHaveLength(1);
    }
  });

  it('falls back to first active team alphabetically if no default flagged', () => {
    const r = resolveMembershipState([
      mk({ status: 'active', team_id: 5, default_team: false }),
      mk({ status: 'active', team_id: 2, default_team: false }),
    ]);
    expect(r.kind).toBe('active');
    if (r.kind === 'active') {
      // Numerically lowest team_id stands in for "alphabetically first" when
      // we don't have team names — simple, deterministic, and correctable
      // by a coach who flips default_team.
      expect(r.defaultTeamId).toBe(2);
    }
  });

  it('treats denied / left / removed as not blocking — pending_only if no active', () => {
    const r = resolveMembershipState([
      mk({ status: 'denied', team_id: 1 }),
      mk({ status: 'left', team_id: 2 }),
    ]);
    expect(r.kind).toBe('no_memberships');
  });

  it('ignores invited rows for the kind (sub-4 will surface them separately)', () => {
    const r = resolveMembershipState([mk({ status: 'invited', team_id: 1 })]);
    expect(r.kind).toBe('no_memberships');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && bunx vitest run src/lib/membership-state.test.ts
```

Expected: FAIL with "Cannot find module './membership-state'".

(If `apps/web` doesn't have vitest configured, install via `bun add -D vitest` at the workspace root and add a minimal `vitest.config.ts` to `apps/web` that resolves the `@/` alias. Most likely it already works since worker uses vitest and the alias is handled by tsconfig path mapping — try first, configure only if it fails.)

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/membership-state.ts`:

```ts
// Pure resolver: given the current user's TeamMembership rows, classify
// their state into one of three buckets that drive dashboard routing
// and the pending banner. No side effects; safe to call anywhere.

import type { TeamMembership } from '@reflect-live/shared';

export type MembershipState =
  | { kind: 'no_memberships' }
  | { kind: 'pending_only'; pending: TeamMembership[] }
  | { kind: 'active';
      active: TeamMembership[];
      activeTeamIds: number[];
      defaultTeamId: number;
      pending: TeamMembership[];
    };

export function resolveMembershipState(memberships: TeamMembership[]): MembershipState {
  const active = memberships.filter((m) => m.status === 'active');
  const pending = memberships.filter((m) => m.status === 'requested');

  if (active.length === 0) {
    if (pending.length > 0) return { kind: 'pending_only', pending };
    return { kind: 'no_memberships' };
  }

  // Pick the user's default team. Prefer the row flagged default_team=true;
  // otherwise the lowest team_id (deterministic; coach can correct via the
  // settings page once 1d ships).
  const flagged = active.find((m) => m.default_team);
  const defaultTeamId = flagged
    ? flagged.team_id
    : [...active].sort((a, b) => a.team_id - b.team_id)[0].team_id;

  return {
    kind: 'active',
    active,
    activeTeamIds: active.map((m) => m.team_id),
    defaultTeamId,
    pending,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && bunx vitest run src/lib/membership-state.test.ts
```

Expected: PASS — 6 cases green.

- [ ] **Step 5: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live
git add apps/web/src/lib/membership-state.ts apps/web/src/lib/membership-state.test.ts
git commit -m "feat(web): membership-state helper + tests

Pure resolver mapping a user's TeamMembership[] to one of:
  - no_memberships    (no rows, or only denied/left/removed)
  - pending_only      (only requested rows — banner state)
  - active            (>=1 active row — normal dashboard scope)

Picks defaultTeamId by default_team=true flag, falling back to
lowest team_id deterministically. 6 vitest cases."
```

---

## Task 2: API — GET /api/teams/discover

**Files:**
- Create: `apps/web/src/app/api/teams/discover/route.ts`

Returns the list of teams an athlete can request to join (`creation_status='active'`). Supports optional `?code=xyz123` to look up a single team by its `team_code`.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/teams/discover/route.ts`:

```ts
// GET /api/teams/discover
// GET /api/teams/discover?code=xyz123
//
// Lists teams an athlete can request to join, or looks up a single
// team by its shareable team_code. Excludes teams with creation_status
// in ('pending','suspended'). Returns minimal info — name, code,
// description — so the browse list stays light.
//
// Auth: requires a Clerk-authenticated user (any role); no team
// scoping needed since this is the discovery surface.

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

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = serviceClient();
  const code = req.nextUrl.searchParams.get('code')?.trim().toLowerCase();

  if (code) {
    const { data, error } = await sb
      .from('teams')
      .select('id, name, code, description, team_code, default_gender')
      .eq('team_code', code)
      .eq('creation_status', 'active')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'team_not_found' }, { status: 404 });
    return NextResponse.json({ team: data });
  }

  const { data, error } = await sb
    .from('teams')
    .select('id, name, code, description, team_code, default_gender')
    .eq('creation_status', 'active')
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data ?? [] });
}
```

- [ ] **Step 2: Smoke-test the endpoint**

Start the dev server (skip if already running):

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live/apps/web && bun run dev
```

Then in a browser hit `http://localhost:3000/api/teams/discover` while logged in. Expected response:

```json
{ "teams": [
  { "id": 1, "name": "UChicago Swim & Dive", "code": "uchicago-swim",
    "description": null, "team_code": "uchicago-swim", "default_gender": "male" }
]}
```

And `http://localhost:3000/api/teams/discover?code=uchicago-swim` returns `{ "team": { ... } }`.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live
git add apps/web/src/app/api/teams/discover/route.ts
git commit -m "feat(api): /api/teams/discover for athlete onboarding browse + code lookup

GET returns active teams (creation_status='active') ordered by name,
or one team by ?code=xyz123. Excludes pending/suspended teams.
Returns minimal fields — name, code, description, team_code,
default_gender — so the browse UI stays light."
```

---

## Task 3: API — POST + GET /api/team-memberships

**Files:**
- Create: `apps/web/src/app/api/team-memberships/route.ts`

POST = athlete submits a join request. GET = current user fetches their own membership rows (any status).

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/team-memberships/route.ts`:

```ts
// POST /api/team-memberships    — athlete submits a join request
// GET  /api/team-memberships    — current user lists their own memberships
//
// On POST:
//   body: { team_id, name, email }
//   Creates a team_memberships row at status='requested' for this user
//   on this team. If the user already has a row on this team, returns
//   400 (don't double-request, don't auto-flip from denied/left back to
//   requested without an explicit reset action).
//
// On GET:
//   returns rows where clerk_user_id = current user. RLS allows this
//   directly, but we use the service-role here too for consistency
//   with the rest of the API.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { currentUser } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = serviceClient();
  const { data, error } = await sb
    .from('team_memberships')
    .select('*')
    .eq('clerk_user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memberships: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { team_id?: unknown; name?: unknown; email?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const teamId = Number(body.team_id);
  if (!Number.isInteger(teamId)) {
    return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });

  let email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email) {
    // Pull from Clerk if the client didn't pass one (defensive — the form
    // pre-fills from Clerk profile, but if it's stripped we fall back).
    const u = await currentUser();
    email = u?.primaryEmailAddress?.emailAddress ?? '';
  }

  const sb = serviceClient();

  // Verify the team exists and is in active state.
  const { data: team } = await sb
    .from('teams')
    .select('id, creation_status')
    .eq('id', teamId)
    .maybeSingle<{ id: number; creation_status: string }>();
  if (!team) return NextResponse.json({ error: 'team_not_found' }, { status: 404 });
  if (team.creation_status !== 'active') {
    return NextResponse.json({ error: 'team_not_open' }, { status: 400 });
  }

  // Prevent duplicate requests on the same team.
  const { data: existing } = await sb
    .from('team_memberships')
    .select('clerk_user_id, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle<{ status: string }>();
  if (existing) {
    return NextResponse.json(
      { error: 'already_member_or_pending', status: existing.status },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
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
      requested_at: now,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, membership: data });
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
git add apps/web/src/app/api/team-memberships/route.ts
git commit -m "feat(api): /api/team-memberships POST request + GET own

POST: athlete submits a join request (team_id + name + email).
Validates team exists and is creation_status='active'; rejects
duplicate requests on the same team. Inserts at status='requested'.

GET: returns the current user's own membership rows (any status).
Used by the dashboard-shell to compute the membership state and by
the pending banner to subscribe via realtime."
```

---

## Task 4: API — PATCH /api/team-memberships/[teamId]

**Files:**
- Create: `apps/web/src/app/api/team-memberships/[teamId]/route.ts`

Lets the current user cancel their pending request (`requested` → `left`) or leave a team they're active on (`active` → `left`). All actions scoped to the calling user.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/team-memberships/[teamId]/route.ts`:

```ts
// PATCH /api/team-memberships/:teamId
//
// Self-service membership actions for the calling user only:
//   { action: 'cancel' } — withdraw a pending request (requested → left)
//   { action: 'leave'  } — voluntarily leave an active team (active → left)
//
// Coach-side actions (approve/deny/remove) live in phase 1c on a
// different endpoint (and require team-manager auth).

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
  ctx: { params: Promise<{ teamId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { teamId: teamIdStr } = await ctx.params;
  const teamId = Number(teamIdStr);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });

  let body: { action?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const action = body.action;
  if (action !== 'cancel' && action !== 'leave') {
    return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data: existing } = await sb
    .from('team_memberships')
    .select('clerk_user_id, team_id, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle<{ status: string }>();
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const requiredStatus = action === 'cancel' ? 'requested' : 'active';
  if (existing.status !== requiredStatus) {
    return NextResponse.json(
      { error: 'wrong_status', expected: requiredStatus, actual: existing.status },
      { status: 400 },
    );
  }

  const { data, error } = await sb
    .from('team_memberships')
    .update({
      status: 'left',
      decided_at: new Date().toISOString(),
      decided_by: userId,
      // default_team flip handled implicitly: a 'left' row cannot be the
      // default; if this was the user's default team we let dashboard-shell
      // pick a new one on next render.
      default_team: false,
    })
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, membership: data });
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
git add apps/web/src/app/api/team-memberships/\[teamId\]/route.ts
git commit -m "feat(api): PATCH /api/team-memberships/[teamId] self-service actions

action='cancel' withdraws a pending request (requested → left).
action='leave' voluntarily leaves an active team (active → left).
Scoped to the calling user only — coach-side decision actions
(approve/deny/remove) live on a separate endpoint in phase 1c."
```

---

## Task 5: PendingBanner component

**Files:**
- Create: `apps/web/src/components/v3/pending-banner.tsx`

Displayed at the top of the dashboard layout when the user has only `requested` memberships. Shows team name(s), elapsed time since request, and a Cancel button. Subscribes to realtime so it disappears the moment a coach approves.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/v3/pending-banner.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/format';
import type { TeamMembership } from '@reflect-live/shared';
import { Clock } from 'lucide-react';

interface Props {
  pending: TeamMembership[];
  teamNames: Record<number, string>;
  onAfterCancel: () => Promise<void> | void;
}

export function PendingBanner({ pending, teamNames, onAfterCancel }: Props) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  if (pending.length === 0) return null;

  async function cancel(teamId: number) {
    setCancellingId(teamId);
    const res = await fetch(`/api/team-memberships/${teamId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    setCancellingId(null);
    if (res.ok) await onAfterCancel();
  }

  return (
    <div
      className="border-b bg-[color:var(--amber-soft)] px-6 py-3"
      style={{ borderColor: 'var(--border)' }}
      role="status"
      aria-live="polite"
    >
      <ul className="space-y-1.5">
        {pending.map((p) => {
          const teamName = teamNames[p.team_id] ?? `team ${p.team_id}`;
          return (
            <li key={p.team_id} className="flex items-center gap-3 text-[13px] text-[color:var(--ink)]">
              <Clock className="size-4 text-[color:var(--amber)]" aria-hidden />
              <span className="flex-1 min-w-0">
                Request to <span className="font-semibold">{teamName}</span> is pending
                <span className="ml-2 text-[11.5px] text-[color:var(--ink-mute)]">
                  · sent {relativeTime(p.requested_at)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancel(p.team_id)}
                disabled={cancellingId === p.team_id}
                className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)]"
              >
                {cancellingId === p.team_id ? 'Cancelling…' : 'Cancel request'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
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
git add apps/web/src/components/v3/pending-banner.tsx
git commit -m "feat(web): PendingBanner component for in-flight join requests

Renders a list of pending request rows (team name + relative time)
with a per-row 'Cancel request' button. Used inside the dashboard
shell when the user's membership state is pending_only or active
with concurrent pending requests."
```

---

## Task 6: Refactor /onboarding/page.tsx

**Files:**
- Modify: `apps/web/src/app/onboarding/page.tsx`

Two ways into the request flow:
1. **Browse list** — show the public team list (existing behavior).
2. **Code entry** — paste a team_code; resolves to a single team via `/api/teams/discover?code=xyz`.

Both paths terminate in: confirm name+email → POST `/api/team-memberships` → redirect to `/dashboard` (where the banner shows the pending state).

- [ ] **Step 1: Replace the file**

Open `apps/web/src/app/onboarding/page.tsx` and replace its contents with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Brand } from '@/components/v3/brand';
import { isValidTeamCode } from '@reflect-live/shared';

interface DiscoverableTeam {
  id: number;
  name: string;
  code: string;
  description: string | null;
  team_code: string | null;
  default_gender: string | null;
}

export default function Onboarding() {
  const router = useRouter();
  const { user } = useUser();

  const [teams, setTeams] = useState<DiscoverableTeam[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection state — either via the browse dropdown OR the code input.
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [codeLookup, setCodeLookup] = useState<DiscoverableTeam | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Athlete identity captured for the request
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // Pre-fill name/email from Clerk
  useEffect(() => {
    if (!user) return;
    if (!name) setName(user.fullName ?? user.firstName ?? '');
    if (!email) setEmail(user.primaryEmailAddress?.emailAddress ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load browseable teams
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/teams/discover');
      const j = await r.json();
      setTeams(j.teams ?? []);
      setLoading(false);
    })();
  }, []);

  // Code-based lookup (debounced once on blur / manual button)
  async function lookupCode() {
    setCodeError(null);
    setCodeLookup(null);
    const lower = code.trim().toLowerCase();
    if (!isValidTeamCode(lower)) {
      // Allow legacy `uchicago-swim`-style codes too — they don't match the
      // generator alphabet but are valid team_code values for migrated teams.
      // Just hit the API and let it 404 if there's no match.
    }
    const r = await fetch(`/api/teams/discover?code=${encodeURIComponent(lower)}`);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setCodeError(j.error ?? 'Code not found');
      return;
    }
    const j = await r.json();
    setCodeLookup(j.team as DiscoverableTeam);
    setPickedId((j.team as DiscoverableTeam).id);
  }

  const selectedTeam =
    codeLookup ?? teams.find((t) => t.id === pickedId) ?? null;

  async function submit() {
    if (!selectedTeam) return;
    setSubmitting(true); setSubmitErr(null);
    const res = await fetch('/api/team-memberships', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: selectedTeam.id,
        name: name.trim(),
        email: email.trim(),
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      router.push('/dashboard');
      return;
    }
    const j = await res.json().catch(() => ({}));
    setSubmitErr(j.error ?? 'Could not submit request');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-[color:var(--paper)]">
      <div className="w-full max-w-[480px]">
        <div className="mb-10 text-center"><Brand size="lg" /></div>
        <section
          className="rounded-2xl bg-[color:var(--card)] border p-8 shadow-[var(--shadow)]"
          style={{ borderColor: 'var(--border)' }}
        >
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ink)]">Find your team</h1>
          <p className="mt-2 text-[14px] text-[color:var(--ink-mute)]">
            Pick a team you belong to or paste a join code your coach gave you.
            We'll send the request to the team for approval.
          </p>

          {loading ? (
            <p className="mt-6 text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
          ) : (
            <>
              <div className="mt-6 space-y-2">
                <label className="text-[12.5px] font-semibold text-[color:var(--ink)]" htmlFor="team-code">
                  Have a team code?
                </label>
                <div className="flex gap-2">
                  <Input
                    id="team-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. uchicago-swim or k7m2vp"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    onClick={lookupCode}
                    disabled={!code.trim()}
                    variant="ghost"
                  >
                    Find
                  </Button>
                </div>
                {codeError && (
                  <p className="text-[11.5px] text-[color:var(--red)]">{codeError}</p>
                )}
                {codeLookup && (
                  <p className="text-[11.5px] text-[color:var(--green)]">
                    Found <span className="font-semibold">{codeLookup.name}</span>.
                  </p>
                )}
              </div>

              <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wide text-[color:var(--ink-mute)]">
                <span className="flex-1 h-px bg-[color:var(--border)]" />
                <span>or browse</span>
                <span className="flex-1 h-px bg-[color:var(--border)]" />
              </div>

              <div className="space-y-2">
                <label className="text-[12.5px] font-semibold text-[color:var(--ink)]" htmlFor="team-pick">
                  Browse teams
                </label>
                <Select
                  value={pickedId ? String(pickedId) : ''}
                  onValueChange={(v) => { setPickedId(Number(v)); setCodeLookup(null); }}
                >
                  <SelectTrigger id="team-pick" className="h-11">
                    <SelectValue placeholder="Pick a team…" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTeam && (
                <div className="mt-6 space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                    Requesting to join
                  </div>
                  <div className="text-[16px] font-bold text-[color:var(--ink)]">{selectedTeam.name}</div>

                  <div className="grid gap-1.5">
                    <label className="text-[11.5px] font-semibold text-[color:var(--ink)]" htmlFor="name">Your name</label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[11.5px] font-semibold text-[color:var(--ink)]" htmlFor="email">Email</label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {submitErr && (
                <p className="mt-4 text-[12.5px] text-[color:var(--red)]">{submitErr}</p>
              )}

              <Button
                onClick={submit}
                disabled={!selectedTeam || !name.trim() || submitting}
                className="mt-6 w-full rounded-xl font-bold"
                style={{ background: 'var(--blue)' }}
              >
                {submitting ? 'Sending request…' : 'Request to join →'}
              </Button>
            </>
          )}
        </section>
      </div>
    </main>
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
git add apps/web/src/app/onboarding/page.tsx
git commit -m "feat(onboarding): browse + code-entry request flow

Replaces the immediate-join onboarding with a request-submission
flow. Two paths converge on the same submission:
  - Paste a team code → /api/teams/discover?code=… resolves it
  - Browse the public team list → pick one
Either way: confirm pre-filled name + email, hit 'Request to join',
which POSTs /api/team-memberships at status='requested'. The
athlete is redirected to /dashboard where the PendingBanner shows
their request status (wired up in the next task)."
```

---

## Task 7: Refactor dashboard-shell

**Files:**
- Modify: `apps/web/src/components/dashboard-shell.tsx`

Make memberships authoritative. Three branches:
1. **No memberships** → redirect to `/onboarding` (request a team).
2. **Pending only** → render the dashboard skeleton with `PendingBanner` and no team-scoped content.
3. **Active** → existing flow, but `team_id` is read from `defaultTeamId` (membership-derived) rather than directly from `user_preferences.team_id`. Pending memberships are surfaced via the banner alongside active state.

The shell also subscribes to realtime on `team_memberships` so a request approval auto-flips the layout from pending to active.

- [ ] **Step 1: Replace the file**

Open `apps/web/src/components/dashboard-shell.tsx` and replace its contents with:

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AppSidebar } from './app-sidebar';
import { CommandPalette } from './command-palette';
import { useSupabase } from '@/lib/supabase-browser';
import { resolveMembershipState } from '@/lib/membership-state';
import { PendingBanner } from './v3/pending-banner';
import type { UserPreferences, Team, UserRole, TeamMembership } from '@reflect-live/shared';

// Re-export the v3 PageHeader so existing imports `from '@/components/dashboard-shell'` keep working.
export { PageHeader } from './v3/page-header';

interface DashboardCtx {
  prefs: UserPreferences;
  team: Team;
  role: UserRole;
  refresh: () => Promise<void>;
}

const Context = createContext<DashboardCtx | null>(null);

export function useDashboard(): DashboardCtx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardShell>');
  return ctx;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const sb = useSupabase();
  const router = useRouter();
  const pathname = usePathname();

  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [teamNames, setTeamNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    // Pull prefs + memberships in parallel; memberships are authoritative
    // for "what teams am I on", prefs hold per-user UI preferences.
    const [{ data: prefRow }, { data: memRows }] = await Promise.all([
      sb.from('user_preferences').select('*').maybeSingle(),
      sb.from('team_memberships').select('*'),
    ]);

    const mems = (memRows ?? []) as TeamMembership[];
    setMemberships(mems);

    // Resolve current state.
    const state = resolveMembershipState(mems);

    if (state.kind === 'no_memberships') {
      router.push('/onboarding');
      return null;
    }

    // Hydrate name lookup for any team that appears in memberships.
    const teamIds = Array.from(new Set(mems.map((m) => m.team_id)));
    if (teamIds.length > 0) {
      const { data: ts } = await sb.from('teams').select('id, name').in('id', teamIds);
      const names: Record<number, string> = {};
      for (const t of (ts ?? []) as Array<{ id: number; name: string }>) names[t.id] = t.name;
      setTeamNames(names);
    }

    if (state.kind === 'pending_only') {
      // Pending state: minimal prefs row may not exist yet; create a stub
      // in memory so the rest of the layout renders. We don't write to
      // user_preferences here — it stays empty until the user has at
      // least one active membership.
      setPrefs(null);
      setTeam(null);
      return { state, prefs: null, team: null };
    }

    // Active state: pick the default team.
    const defaultTeamId = state.defaultTeamId;
    const { data: teamData } = await sb.from('teams').select('*').eq('id', defaultTeamId).single();
    setTeam(teamData as Team);

    // Make sure user_preferences exists and points at the active team
    // for backward compat (the old prefs.team_id is still consulted by
    // some routes during the transition). Insert if missing.
    if (!prefRow) {
      const activeMem = state.active.find((m) => m.team_id === defaultTeamId);
      const { data: created } = await sb
        .from('user_preferences')
        .upsert({
          team_id: defaultTeamId,
          role: activeMem?.role ?? 'athlete',
          watchlist: [],
          group_filter: null,
        })
        .select('*')
        .maybeSingle();
      setPrefs(created as UserPreferences);
      return { state, prefs: created as UserPreferences, team: teamData as Team };
    }

    const p = prefRow as UserPreferences;
    setPrefs(p);
    return { state, prefs: p, team: teamData as Team };
  }, [sb, router]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await fetchAll();
      if (!alive || !result) return;
      const role = (result.prefs?.role ?? 'coach') as UserRole;
      const isAdminPath = pathname.startsWith('/dashboard/admin');
      const isAthletePath = pathname.startsWith('/dashboard/athlete');
      const isCaptainPath = pathname.startsWith('/dashboard/captain');
      const isSettings = pathname === '/dashboard/settings';
      if (isAdminPath && role !== 'admin') {
        router.replace('/dashboard');
        return;
      }
      if (role === 'athlete' && !isAthletePath && !isSettings) {
        router.replace('/dashboard/athlete');
        return;
      }
      if (role === 'captain' && !isCaptainPath && !isSettings) {
        router.replace('/dashboard/captain');
        return;
      }
      setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Realtime: when this user's membership rows change, re-fetch.
  // Covers approval/denial flips coming from the coach side.
  useEffect(() => {
    const channel = sb
      .channel('team_memberships_self')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_memberships' },
        () => { void fetchAll(); },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [sb, fetchAll]);

  const role: UserRole = (prefs?.role as UserRole) ?? 'coach';
  const state = resolveMembershipState(memberships);
  const pendingMems = state.kind === 'no_memberships' ? [] : state.pending;

  // Loading skeleton (same as before)
  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar role="coach" />
        <SidebarInset>
          <header className="flex h-16 items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--card)] px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-2 h-4 bg-[color:var(--border)]" />
            <Skeleton className="h-5 w-48" />
          </header>
          <main className="flex-1 p-6 space-y-4">
            <Skeleton className="h-10 w-72" />
            <div className="grid grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-80" />
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // Pending-only: render the layout with the banner and an empty content
  // area. No DashboardCtx provider — children that call useDashboard will
  // throw, which is fine since they're scoped to active-membership routes.
  if (state.kind === 'pending_only') {
    return (
      <SidebarProvider>
        <AppSidebar role="athlete" />
        <SidebarInset>
          <PendingBanner pending={pendingMems} teamNames={teamNames} onAfterCancel={fetchAll} />
          <main className="flex-1 p-6">
            <div
              className="rounded-2xl bg-[color:var(--card)] border px-6 py-10 text-center"
              style={{ borderColor: 'var(--border)' }}
            >
              <h1 className="text-xl font-bold text-[color:var(--ink)]">Hang tight</h1>
              <p className="mt-2 text-[13px] text-[color:var(--ink-mute)]">
                We'll text you the moment your coach approves the request. You can
                cancel above if you submitted by mistake.
              </p>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // Active state — render the dashboard normally, with the banner ribbon
  // up top if the user *also* has pending requests on other teams.
  if (!prefs || !team) {
    // Defensive — shouldn't happen if state.kind === 'active' but the
    // type narrowing helps TS see the prefs/team are non-null below.
    return null;
  }
  return (
    <Context.Provider value={{ prefs, team, role, refresh: async () => { await fetchAll(); } }}>
      <SidebarProvider>
        <AppSidebar
          role={role}
          teamName={team.name}
          hasLinkedAthlete={Boolean(prefs.impersonate_player_id)}
        />
        <SidebarInset>
          {pendingMems.length > 0 && (
            <PendingBanner
              pending={pendingMems}
              teamNames={teamNames}
              onAfterCancel={fetchAll}
            />
          )}
          {children}
        </SidebarInset>
        <CommandPalette teamId={prefs.team_id} isAdmin={role === 'admin'} />
      </SidebarProvider>
    </Context.Provider>
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
git add apps/web/src/components/dashboard-shell.tsx
git commit -m "feat(web): dashboard-shell reads team_memberships as authoritative

Three render branches based on resolveMembershipState:
  - no_memberships → redirect to /onboarding
  - pending_only   → sidebar + PendingBanner + 'hang tight' card
  - active         → existing dashboard, banner ribbon if any
                     pending requests exist concurrently

Realtime subscription on team_memberships re-fetches on any change
to this user's rows, so coach approval/denial flips the UI live.
Existing user_preferences row gets created on the fly when an
active membership lands without a prefs row yet (covers the
post-approval first-render path)."
```

---

## Task 8: Smoke-test end-to-end

**Files:** none (operational task).

- [ ] **Step 1: Push the branch**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment4/reflect-live
git push
```

Vercel auto-deploys. Wait for the deploy to finish.

- [ ] **Step 2: Verify the existing dashboard still loads**

Navigate to the deployed dashboard as your existing admin user. Confirm:
- The dashboard loads (no redirect to /onboarding — your active membership should resolve correctly).
- Sessions, athletes, heatmap, settings pages all load as before.
- No console errors.

- [ ] **Step 3: Manual end-to-end test of the new request flow**

If you have access to a test Clerk account (or can create a fresh one) without an existing membership:

1. Sign up via Clerk with a fresh email.
2. Land on `/onboarding`. Confirm you see the new "Find your team" UI with both browse and code entry.
3. Try the code path: paste `uchicago-swim` and click Find. Should resolve to the swim team.
4. Confirm name + email are pre-filled from Clerk.
5. Click "Request to join". You should land on `/dashboard` with a yellow banner saying the request is pending.
6. The page should be otherwise empty ("Hang tight" card).
7. Click "Cancel request". The banner should disappear and you should be redirected back to /onboarding.

If Clerk doesn't allow easy test accounts, this step can be deferred until phase 1c is up — at that point we can approve a request and watch the realtime flip work end-to-end.

- [ ] **Step 4: Done**

Phase 1b ships the athlete side. Phase 1c (next plan) builds the coach approval inbox so you can actually act on incoming requests.

---

## What 1b delivers

- An athlete can find a team via browse list or by pasting a `team_code`, submit a request, and see a pending banner.
- The dashboard shell reads `team_memberships` as authoritative; existing users with active memberships keep working without changes.
- A pending-only user sees a holding-pattern dashboard with a clear cancel affordance.
- Realtime is wired so once 1c lands and a coach approves, the athlete's UI flips automatically.

## Out of scope (still deferred to later phases)

- Coach approval/denial UI (1c)
- Team creation flow (1d)
- Admin all-teams panel (1d)
- SMS notification on decision (1e — though the realtime path is in place already)
- Multi-team team switcher (sub-2)
- Coach invite path (sub-4)
