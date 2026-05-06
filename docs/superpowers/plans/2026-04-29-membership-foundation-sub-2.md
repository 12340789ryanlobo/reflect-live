# Membership Foundation — Sub-2 (Multi-Team Switcher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A user with active memberships on multiple teams can flip the active team from a sidebar dropdown. Platform admin can pass through to any team in the system. The role-switcher already in the sidebar continues to work, scoped per-active-team.

**Architecture:** A new `PATCH /api/me/active-team` endpoint handles the flip, with server-side auth: target team must be in the caller's active memberships OR caller is `is_platform_admin=true`. A new `TeamSwitcher` component renders in the sidebar header where the static team name currently sits — collapses to plain text when the user has only one team, becomes a dropdown when they have two or more (or are a platform admin). On switch, the dashboard reloads and the new team's data hydrates.

**Tech Stack:** Next.js App Router, Clerk auth, Supabase service-role for the server endpoint, Radix DropdownMenu for the picker, the existing `app-sidebar.tsx` for placement.

---

## File Structure

**Files to create:**
- `apps/web/src/app/api/me/active-team/route.ts` — PATCH endpoint that changes which team is active for the current user
- `apps/web/src/components/v3/team-switcher.tsx` — sidebar dropdown UI

**Files to modify:**
- `apps/web/src/components/app-sidebar.tsx` — replace the static team-name span in the header with `<TeamSwitcher>`

---

## Task 1: API — PATCH /api/me/active-team

**Files:**
- Create: `apps/web/src/app/api/me/active-team/route.ts`

PATCH with body `{ team_id: number }`. Server validates that the caller has an active membership on the team OR is a platform admin (in which case any team is fair game — pass-through). Updates `user_preferences.team_id` and `updated_at`.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/me/active-team/route.ts`:

```ts
// PATCH /api/me/active-team   body: { team_id }
//
// Switches which team is "currently active" for the caller. Auth:
//   1. Caller must have an active team_memberships row on that team, OR
//   2. Caller is is_platform_admin=true (pass-through to any team).
//
// Updates user_preferences.team_id (the legacy "currently viewing" pointer)
// — dashboard-shell already resolves the active membership row from this
// after sub-1 landed.

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

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { team_id?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const teamId = Number(body.team_id);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });

  const sb = serviceClient();

  // Authorize: active membership on this team, or platform admin.
  const [mem, prefs] = await Promise.all([
    sb.from('team_memberships')
      .select('role, status')
      .eq('clerk_user_id', userId)
      .eq('team_id', teamId)
      .maybeSingle<{ role: string; status: string }>(),
    sb.from('user_preferences')
      .select('is_platform_admin, role')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ is_platform_admin: boolean; role: string | null }>(),
  ]);
  const hasActive = mem.data?.status === 'active';
  const isAdmin = prefs.data?.is_platform_admin === true || prefs.data?.role === 'admin';
  if (!hasActive && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Verify the team exists.
  const { data: team } = await sb.from('teams').select('id, name').eq('id', teamId).maybeSingle<{ id: number; name: string }>();
  if (!team) return NextResponse.json({ error: 'team_not_found' }, { status: 404 });

  // Update. We upsert so users created via the request flow before
  // user_preferences existed get a row created on first switch.
  const { error } = await sb
    .from('user_preferences')
    .upsert({
      clerk_user_id: userId,
      team_id: teamId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clerk_user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, team });
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
git add apps/web/src/app/api/me/active-team/route.ts
git commit -m "feat(api): PATCH /api/me/active-team for team switcher

Switches user_preferences.team_id (the 'currently viewing' pointer)
to a target team. Server-side auth: caller must have an active
team_memberships row on that team, OR be a platform admin (admins
pass through to any team without a real membership).

Used by the sidebar TeamSwitcher dropdown. Dashboard-shell picks
the new team up on its next fetchAll cycle."
```

---

## Task 2: TeamSwitcher component

**Files:**
- Create: `apps/web/src/components/v3/team-switcher.tsx`

Renders inside the sidebar header. Three behaviors:
- 0 active memberships → renders nothing (the user is in the pending-banner state already)
- 1 active membership AND not platform admin → renders the team name as plain text (no dropdown — there's nothing to switch to)
- 2+ memberships, OR platform admin → renders a dropdown trigger showing the current team name, with menu items for each membership team. For platform admin only: a separator + a list of "Other teams" (every other team in the system, fetched lazily on dropdown open).

Switching calls `PATCH /api/me/active-team` and then `router.refresh()` to re-hydrate the dashboard.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/v3/team-switcher.tsx`:

```tsx
'use client';

// Sidebar team-switcher dropdown.
//
//   - 0 memberships → renders nothing
//   - 1 (and not platform admin) → renders the team name as plain text
//   - 2+ OR platform admin → dropdown with all the user's teams + (for
//     platform admin) every other team in the system as a pass-through list
//
// On switch, PATCHes /api/me/active-team and reloads the dashboard.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSupabase } from '@/lib/supabase-browser';
import { ChevronsUpDown, Plus } from 'lucide-react';
import type { TeamMembership } from '@reflect-live/shared';

interface Props {
  currentTeamId: number;
  currentTeamName: string;
  isPlatformAdmin: boolean;
}

interface TeamLite { id: number; name: string }

export function TeamSwitcher({ currentTeamId, currentTeamName, isPlatformAdmin }: Props) {
  const router = useRouter();
  const sb = useSupabase();
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [memberTeamNames, setMemberTeamNames] = useState<Record<number, string>>({});
  const [allTeams, setAllTeams] = useState<TeamLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [switching, setSwitching] = useState<number | null>(null);

  // Pull the user's memberships on mount. RLS allows them to read their
  // own rows. Team names follow in a second tiny query.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: mems } = await sb.from('team_memberships').select('*');
      if (!alive) return;
      const list = ((mems ?? []) as TeamMembership[]).filter((m) => m.status === 'active');
      setMemberships(list);
      const teamIds = list.map((m) => m.team_id);
      if (teamIds.length > 0) {
        const { data: ts } = await sb.from('teams').select('id, name').in('id', teamIds);
        const names: Record<number, string> = {};
        for (const t of (ts ?? []) as TeamLite[]) names[t.id] = t.name;
        if (alive) setMemberTeamNames(names);
      }
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [sb]);

  // Platform admin: lazy-load every team for the pass-through list,
  // only when the dropdown opens (the click-handler triggers it).
  async function loadAllTeams() {
    if (!isPlatformAdmin) return;
    if (allTeams.length > 0) return;
    const r = await fetch('/api/teams');
    if (!r.ok) return;
    const j = await r.json();
    setAllTeams((j.teams ?? []) as TeamLite[]);
  }

  async function switchTo(teamId: number) {
    if (teamId === currentTeamId) return;
    setSwitching(teamId);
    const res = await fetch('/api/me/active-team', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ team_id: teamId }),
    });
    setSwitching(null);
    if (res.ok) {
      router.push('/dashboard');
      router.refresh();
    }
  }

  // Don't render anything until we've loaded — avoids a flash of the
  // wrong state. Static fallback before load: just the team name.
  if (!loaded) {
    return (
      <span className="truncate text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
        {currentTeamName}
      </span>
    );
  }

  // Only one team and not admin — nothing to switch to. Plain text.
  if (memberships.length <= 1 && !isPlatformAdmin) {
    return (
      <span className="truncate text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
        {currentTeamName}
      </span>
    );
  }

  // Pass-through teams = all teams the admin can view but doesn't have a
  // membership on. Computed after both lists are loaded.
  const memberTeamIds = new Set(memberships.map((m) => m.team_id));
  const passthroughTeams = allTeams.filter((t) => !memberTeamIds.has(t.id));

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void loadAllTeams(); }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded transition hover:opacity-80"
          aria-label="Switch active team"
        >
          <span className="truncate text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
            {currentTeamName}
          </span>
          <ChevronsUpDown className="size-3 text-[color:var(--ink-mute)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-60">
        <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)]">
          Your teams
        </DropdownMenuLabel>
        {memberships.map((m) => {
          const name = memberTeamNames[m.team_id] ?? `team ${m.team_id}`;
          return (
            <DropdownMenuItem
              key={m.team_id}
              onSelect={(e) => { e.preventDefault(); void switchTo(m.team_id); }}
              className="flex items-center justify-between"
            >
              <span className="truncate">{name}</span>
              {m.team_id === currentTeamId && (
                <span className="ml-2 text-[10.5px] text-[color:var(--ink-mute)]">current</span>
              )}
              {switching === m.team_id && (
                <span className="ml-2 text-[10.5px] text-[color:var(--ink-mute)]">switching…</span>
              )}
            </DropdownMenuItem>
          );
        })}

        {isPlatformAdmin && passthroughTeams.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)]">
              All teams (admin)
            </DropdownMenuLabel>
            {passthroughTeams.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={(e) => { e.preventDefault(); void switchTo(t.id); }}
                className="flex items-center justify-between"
              >
                <span className="truncate">{t.name}</span>
                {switching === t.id && (
                  <span className="ml-2 text-[10.5px] text-[color:var(--ink-mute)]">switching…</span>
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/team/new" className="flex items-center gap-2 text-[12.5px]">
            <Plus className="size-3.5" />
            <span>Create another team</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
git add apps/web/src/components/v3/team-switcher.tsx
git commit -m "feat(web): TeamSwitcher component for sidebar header

- 0 memberships → renders nothing (pending-banner state covers UX)
- 1 membership and not platform admin → plain team-name text
- 2+ OR platform admin → dropdown with all of the user's active
  teams + (for admin) a separator and pass-through list of every
  other team in the system

On switch, PATCHes /api/me/active-team then router.push+refresh
so the dashboard re-hydrates against the new team. Pass-through
team list is lazy-loaded only when the dropdown opens (one extra
fetch when an admin actually clicks)."
```

---

## Task 3: Wire TeamSwitcher into the sidebar header

**Files:**
- Modify: `apps/web/src/components/app-sidebar.tsx`

The current header renders a static `<span>{teamName}</span>` next to the role pill. Replace it with `<TeamSwitcher>`. Need to thread `currentTeamId` and `isPlatformAdmin` through `AppSidebar` props (currently it gets `teamName` only).

- [ ] **Step 1: Update AppSidebar props + render**

Find `AppSidebar` in `apps/web/src/components/app-sidebar.tsx`. It currently takes `{ role, teamName, hasLinkedAthlete }`.

Extend the props:

```ts
export function AppSidebar({
  role,
  teamName,
  teamId,                          // NEW
  isPlatformAdmin = false,         // NEW
  hasLinkedAthlete,
}: {
  role: UserRole;
  teamName?: string;
  teamId?: number;
  isPlatformAdmin?: boolean;
  hasLinkedAthlete?: boolean;
}) {
```

Find the existing static team-name span in the header (search for `teamName` rendering — typically inside the role-row block). Replace:

```tsx
            {teamName && (
              <span className="truncate text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
                {teamName}
              </span>
            )}
```

with:

```tsx
            {teamName && teamId && (
              <TeamSwitcher
                currentTeamId={teamId}
                currentTeamName={teamName}
                isPlatformAdmin={isPlatformAdmin}
              />
            )}
```

Add the import at the top:

```ts
import { TeamSwitcher } from './v3/team-switcher';
```

- [ ] **Step 2: Update DashboardShell to pass the new props**

Find `apps/web/src/components/dashboard-shell.tsx`. Locate the `<AppSidebar>` render (in the active branch — "Active state — render the dashboard normally"). Update the props:

```tsx
        <AppSidebar
          role={role}
          teamName={team.name}
          teamId={team.id}
          isPlatformAdmin={prefs.is_platform_admin === true}
          hasLinkedAthlete={Boolean(prefs.impersonate_player_id)}
        />
```

The pending-only branch's `<AppSidebar role="athlete" />` doesn't need updating — the user isn't on a team yet, so there's nothing to switch.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/web
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit + push**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add apps/web/src/components/app-sidebar.tsx apps/web/src/components/dashboard-shell.tsx
git commit -m "feat(sidebar): wire TeamSwitcher into the header

AppSidebar gains teamId + isPlatformAdmin props; the static
team-name span in the header becomes a TeamSwitcher dropdown.
DashboardShell passes the props from prefs (is_platform_admin
flag) and the resolved active team. Pending-only branch
unchanged — no team to switch to in that state."
git push
```

---

## What sub-2 delivers

- A user on multiple teams can flip the active dashboard view from a sidebar dropdown.
- Platform admin sees their own memberships first, then a "All teams" pass-through list of every other team in the system — useful for spot-checking team data without being a real member.
- The men's/women's swim split becomes operational: create both teams via 1d, switch between them via this dropdown.

## Out of scope (still deferred)

- **Sub-3** WhatsApp opt-in seamless flow.
- **Sub-4** Coach invite path with SMS claim link.
- **Sub-5** Bulk roster CSV upload.
- **1e** Decision SMS notification when coach approves/denies a request.
- Full role-switcher rework so role reflects the active team's role rather than the global pref. Today the role switcher and team switcher live side-by-side; a sub-2.5 polish can collapse them once we know how coaches use both.
