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
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const fetchAll = useCallback(async () => {
    // Pull prefs + memberships via the service-role API endpoints
    // rather than the browser-side Supabase client. The browser client
    // depends on Clerk JWT → Supabase RLS, which has bitten us when
    // the JWT template drifts; the API endpoints use auth() server-side
    // and the service-role key, so they always see the right rows.
    // Memberships are authoritative for "what teams am I on"; prefs
    // hold per-user UI preferences.
    const [prefsRes, memsRes] = await Promise.all([
      fetch('/api/preferences').then((r) => r.ok ? r.json() : { preferences: null, team: null }),
      fetch('/api/team-memberships').then((r) => r.ok ? r.json() : { memberships: [] }),
    ]);
    const prefRow = (prefsRes.preferences ?? null) as UserPreferences | null;
    // Team comes bundled with prefs (service-role) so we never have to
    // hit browser-client RLS on the teams table — that path 406s
    // intermittently for fresh users.
    let teamFromApi: Team | null = (prefsRes.team ?? null) as Team | null;
    const mems = ((memsRes.memberships ?? []) as TeamMembership[]);
    setMemberships(mems);

    // Resolve current state.
    const state = resolveMembershipState(mems);

    // Platform admins are not gated by membership state — they can keep
    // working even if all their memberships are 'left'/'denied'/etc.
    // (Otherwise an admin who accidentally leaves their last team would
    // be permanently bounced to /onboarding with no recovery path.)
    const prefIsPlatformAdmin = (prefRow as UserPreferences | null)?.is_platform_admin === true;

    if (state.kind === 'no_memberships' && !prefIsPlatformAdmin) {
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

    if (state.kind === 'pending_only' && !prefIsPlatformAdmin) {
      // Pending state: minimal prefs row may not exist yet; we render the
      // layout in pending mode without a Context provider so children that
      // call useDashboard never see this branch (the routes wired up to
      // useDashboard are for active members).
      setPrefs(null);
      setTeam(null);
      return { state, prefs: null, team: null, effectiveRole: 'athlete' as UserRole };
    }

    // Active state: pick the default team. Platform admins without an
    // active membership fall back to prefRow.team_id — they always have
    // a prefs row (the schema defaults team_id on insert), and the
    // /dashboard/admin/teams page lets them switch from there.
    const fallbackTeamId =
      prefIsPlatformAdmin && state.kind !== 'active'
        ? (prefRow as UserPreferences).team_id
        : null;
    const defaultTeamId =
      state.kind === 'active' ? state.defaultTeamId : fallbackTeamId;
    if (defaultTeamId == null) {
      // Defensive — shouldn't happen because we either have an active
      // membership OR we're a platform admin with prefs.team_id. If it
      // does, send to onboarding rather than crash.
      router.push('/onboarding');
      return null;
    }
    // Prefer the team bundled with /api/preferences. Fall back to a
    // browser-client query only if the API didn't include it (e.g. a
    // freshly-created prefs row whose team_id hasn't been mirrored
    // yet) — and then to the membership row's team as a last resort.
    let teamData: Team | null = teamFromApi;
    if (!teamData || teamData.id !== defaultTeamId) {
      const { data: t } = await sb.from('teams').select('*').eq('id', defaultTeamId).maybeSingle();
      teamData = (t as Team | null) ?? teamFromApi;
    }
    setTeam(teamData);

    const activeMem =
      state.kind === 'active'
        ? state.active.find((m) => m.team_id === defaultTeamId)
        : undefined;
    // Platform admins without a membership get a synthetic 'admin' role.
    // For everyone else, the membership row's role is authoritative.
    const membershipRole = (activeMem?.role
      ?? (prefIsPlatformAdmin ? 'admin' : 'athlete')) as UserRole;
    const membershipPlayerId = activeMem?.player_id ?? null;

    // Pending request count for the active team — used to surface the
    // "Requests" sidebar entry only when something needs attention.
    // RLS hides other teams' memberships from non-managers, so this
    // safely returns 0 for athletes.
    const { count: pendingCount } = await sb
      .from('team_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', defaultTeamId)
      .eq('status', 'requested');
    setPendingRequestCount(pendingCount ?? 0);

    // Make sure user_preferences exists and points at the active team.
    // Route through POST /api/preferences (service-role, bypasses RLS)
    // rather than the browser Supabase client — the browser-client
    // upsert was returning null silently when RLS hiccupped, leaving
    // prefs=null and rendering a blank page on first login after
    // approval.
    if (!prefRow) {
      const upRes = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          team_id: defaultTeamId,
          watchlist: [],
          group_filter: null,
          role: membershipRole,
          // Pre-fill from membership so a freshly-approved athlete
          // doesn't land on the empty player picker. (B1 fix.)
          impersonate_player_id: membershipPlayerId,
        }),
      }).then((r) => r.ok ? r.json() : null).catch(() => null);
      const createdPrefs = (upRes?.preferences ?? null) as UserPreferences | null;
      // POST also returns the team bundled — use it if the GET path
      // earlier didn't have one yet (e.g. team_id was set by this very
      // POST and the GET ran first against a missing prefs row).
      if (upRes?.team && !teamData) {
        teamData = upRes.team as Team;
        setTeam(teamData);
      }
      if (createdPrefs) {
        setPrefs(createdPrefs);
        return { state, prefs: createdPrefs, team: teamData as Team, effectiveRole: membershipRole };
      }
      // Defensive: if the API somehow didn't return the row, build a
      // synthetic prefs object so the shell can render. The next mount
      // will re-fetch via GET /api/preferences and pick up the real row.
      const synthetic: UserPreferences = {
        clerk_user_id: '',
        team_id: defaultTeamId,
        watchlist: [],
        group_filter: null,
        role: membershipRole,
        impersonate_player_id: membershipPlayerId,
        is_platform_admin: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setPrefs(synthetic);
      return { state, prefs: synthetic, team: teamData as Team, effectiveRole: membershipRole };
    }

    const p = prefRow as UserPreferences;

    // Authoritative role: team_memberships.role is the source of truth for
    // non-admins. Platform admins (and users whose role is admin) keep
    // unrestricted control of their view (so the role-switcher and
    // "view as athlete" flow keep working). For everyone else, force
    // the prefs.role to match the membership role and self-heal a stale
    // row if it drifted (e.g. legacy prefs created before membership
    // existed and got `role='coach'` from the schema default).
    // Admin detection MUST use the stable `is_platform_admin` flag, not
    // the mutable `role` column. Reason: the role-switcher writes
    // `role='coach'` (or 'captain' / 'athlete') when an admin clicks
    // "View as coach". If we treated `role === 'admin'` as the admin
    // marker, that single click demoted the admin to non-admin status,
    // the heal logic below forced their role back to membership.role
    // ('athlete'), and they got bounced to the athlete view with no way
    // to switch back. is_platform_admin is set once at account creation
    // and not touched by the role-switcher, so it survives view-switches.
    const isAdmin = p.is_platform_admin === true;
    const effectiveRole: UserRole = isAdmin ? ((p.role ?? membershipRole) as UserRole) : membershipRole;

    // Heal stale prefs for non-admins:
    //   role          → must match team_memberships (A1)
    //   impersonate   → must match team_memberships.player_id (B1).
    //   This keeps athletes pointed at their own player and prevents
    //   coaches/captains from accidentally impersonating someone else.
    const needsRoleHeal = !isAdmin && p.role !== membershipRole;
    const needsLinkHeal = !isAdmin && p.impersonate_player_id !== membershipPlayerId;
    if (needsRoleHeal || needsLinkHeal) {
      const patch: Record<string, unknown> = {};
      if (needsRoleHeal) patch.role = membershipRole;
      if (needsLinkHeal) patch.impersonate_player_id = membershipPlayerId;
      const { data: healed } = await sb
        .from('user_preferences')
        .update(patch)
        .eq('clerk_user_id', p.clerk_user_id)
        .select('*')
        .maybeSingle();
      const healedPrefs = (healed ?? { ...p, ...patch }) as UserPreferences;
      setPrefs(healedPrefs);
      return { state, prefs: healedPrefs, team: teamData as Team, effectiveRole };
    }

    setPrefs(p);
    return { state, prefs: p, team: teamData as Team, effectiveRole };
  }, [sb, router]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await fetchAll();
      if (!alive || !result) return;
      const role = result.effectiveRole;
      const isAdminPath = pathname.startsWith('/dashboard/admin');
      const isAthletePath = pathname.startsWith('/dashboard/athlete');
      const isSettings = pathname === '/dashboard/settings';
      if (isAdminPath && role !== 'admin') {
        router.replace('/dashboard');
        return;
      }
      // Athletes are locked to their own surfaces — anything else bounces
      // to their canonical player page (security fix from A1). Allowed:
      //   /dashboard/athlete*           — picker fallback
      //   /dashboard/players/[their-id] — canonical own-player URL
      //   /dashboard/settings           — personal settings
      //   /dashboard/fitness            — team activity / leaderboard
      //                                   (peer accountability)
      const isFitnessPath = pathname === '/dashboard/fitness';
      if (role === 'athlete' && !isAthletePath && !isSettings && !isFitnessPath) {
        const ownPlayerPath = result.prefs?.impersonate_player_id
          ? `/dashboard/players/${result.prefs.impersonate_player_id}`
          : null;
        // Allow staying when they're already on their own canonical URL —
        // without this guard, /dashboard/athlete redirects to
        // /dashboard/players/[id], dashboard-shell bounces back to
        // /dashboard/athlete, and the two pages ping-pong forever.
        if (!(ownPlayerPath && pathname === ownPlayerPath)) {
          router.replace(ownPlayerPath ?? '/dashboard/athlete');
          return;
        }
      }
      // Captains land on /dashboard/captain when they hit the coach root,
      // but their sidebar entries (live, heatmap, events, requests, etc.)
      // are real pages they're allowed to see — don't sweep them back to
      // /dashboard/captain.
      if (role === 'captain' && pathname === '/dashboard') {
        router.replace('/dashboard/captain');
        return;
      }
      // Sessions + Templates are coach-only by default; captains see them
      // only when their team has captain_can_view_sessions=true.
      const captainCanViewSessions = result.team?.captain_can_view_sessions === true;
      if (role === 'captain' && !captainCanViewSessions &&
          (pathname.startsWith('/dashboard/sessions') || pathname.startsWith('/dashboard/templates'))) {
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

  const state = resolveMembershipState(memberships);
  const pendingMems = state.kind === 'no_memberships' ? [] : state.pending;

  // Re-derive the same effective role as fetchAll so renders post-realtime
  // also respect membership authority. team_memberships is the floor;
  // platform admins / role='admin' may override.
  const activeMem = state.kind === 'active'
    ? state.active.find((m) => m.team_id === state.defaultTeamId)
    : undefined;
  const membershipRole = (activeMem?.role ?? 'athlete') as UserRole;
  // Same canonical admin marker as fetchAll above. is_platform_admin is
  // stable across role switches; prefs.role is overwritten by the
  // role-switcher and would silently demote the user the moment they
  // clicked 'View as coach'.
  const isAdminUser = prefs?.is_platform_admin === true;
  const role: UserRole = isAdminUser
    ? ((prefs?.role as UserRole) ?? membershipRole)
    : membershipRole;

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
  // Platform admins skip this branch — they always render the full shell.
  const isPlatformAdmin = prefs?.is_platform_admin === true;
  if (state.kind === 'pending_only' && !isPlatformAdmin) {
    return (
      <SidebarProvider>
        <AppSidebar role="athlete" />
        <SidebarInset>
          <PendingBanner pending={pendingMems} teamNames={teamNames} onAfterCancel={async () => { await fetchAll(); }} />
          <main className="flex-1 p-6">
            <div
              className="rounded-2xl bg-[color:var(--card)] border px-6 py-10 text-center"
              style={{ borderColor: 'var(--border)' }}
            >
              <h1 className="text-xl font-bold text-[color:var(--ink)]">Hang tight</h1>
              <p className="mt-2 text-[13px] text-[color:var(--ink-mute)]">
                We&rsquo;ll text you the moment your coach approves the request. You can
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
          teamId={team.id}
          isPlatformAdmin={prefs.is_platform_admin === true}
          hasLinkedAthlete={Boolean(prefs.impersonate_player_id)}
          captainCanViewSessions={team.captain_can_view_sessions === true}
          pendingRequestCount={pendingRequestCount}
          ownPlayerId={prefs.impersonate_player_id ?? null}
        />
        <SidebarInset>
          {pendingMems.length > 0 && (
            <PendingBanner
              pending={pendingMems}
              teamNames={teamNames}
              onAfterCancel={async () => { await fetchAll(); }}
            />
          )}
          {children}
        </SidebarInset>
        <CommandPalette teamId={prefs.team_id} isAdmin={role === 'admin'} />
      </SidebarProvider>
    </Context.Provider>
  );
}
