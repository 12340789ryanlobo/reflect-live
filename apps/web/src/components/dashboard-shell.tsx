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
      // Pending state: minimal prefs row may not exist yet; we render the
      // layout in pending mode without a Context provider so children that
      // call useDashboard never see this branch (the routes wired up to
      // useDashboard are for active members).
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
