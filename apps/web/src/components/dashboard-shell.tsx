'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AppSidebar } from './app-sidebar';
import { CommandPalette } from './command-palette';
import { useSupabase } from '@/lib/supabase-browser';
import type { UserPreferences, Team, UserRole } from '@reflect-live/shared';

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
  const [loading, setLoading] = useState(true);

  async function fetchAll() {
    const { data: pref } = await sb.from('user_preferences').select('*').maybeSingle();
    if (!pref) {
      router.push('/onboarding');
      return null;
    }
    const p = pref as UserPreferences;
    setPrefs(p);
    const { data: teamData } = await sb.from('teams').select('*').eq('id', p.team_id).single();
    setTeam(teamData as Team);
    return p;
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await fetchAll();
      if (!alive || !p) return;
      const role = (p.role ?? 'coach') as UserRole;
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
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const role: UserRole = (prefs?.role as UserRole) ?? 'coach';

  if (loading || !prefs || !team) {
    return (
      <SidebarProvider>
        <AppSidebar role="coach" />
        <SidebarInset>
          <header className="flex h-16 items-center gap-2 border-b border-[color:var(--hairline)] px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-2 h-4" />
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

  return (
    <Context.Provider value={{ prefs, team, role, refresh: async () => { await fetchAll(); } }}>
      <SidebarProvider>
        <AppSidebar role={role} teamName={team.name} hasLinkedAthlete={Boolean(prefs.impersonate_player_id)} />
        <SidebarInset>{children}</SidebarInset>
        <CommandPalette teamId={prefs.team_id} isAdmin={role === 'admin'} />
      </SidebarProvider>
    </Context.Provider>
  );
}

/**
 * PageHeader — the editorial masthead at the top of every dashboard page.
 * Station code + eyebrow + display-serif title + optional right-side controls.
 * The bottom border is a hairline, the top edge picks up a cyan LIVE indicator.
 */
export function PageHeader({
  code,
  title,
  italic,
  eyebrow,
  subtitle,
  right,
  live,
}: {
  code?: string;
  title: ReactNode;
  italic?: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  live?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--hairline)] bg-[color:var(--ink)]/85 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--ink)]/70">
      {/* Top hairline — cyan when live */}
      <div
        className="h-[2px] w-full"
        style={{
          background: live
            ? 'linear-gradient(to right, transparent, hsl(188 82% 58%) 50%, transparent)'
            : 'linear-gradient(to right, transparent, hsl(220 16% 22%) 50%, transparent)',
        }}
      />
      <div className="flex flex-col gap-1 px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="text-[color:var(--bone-mute)] hover:text-[color:var(--bone)]" />
          <Separator orientation="vertical" className="mx-1 h-4 bg-[color:var(--hairline)]" />
          <div className="flex flex-1 items-center gap-3">
            {code && <span className="station-code">{code}</span>}
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {live && (
              <span className="inline-flex items-center gap-1.5">
                <span className="live-dot" />
                <span className="eyebrow-signal">LIVE</span>
              </span>
            )}
          </div>
          {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
        </div>
        <div className="flex items-baseline gap-3 flex-wrap pl-1">
          <h1 className="h-serif text-2xl md:text-3xl font-semibold leading-tight tracking-tight">
            {title}
            {italic && (
              <>
                {' '}
                <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
                  {italic}
                </span>
              </>
            )}
          </h1>
          {subtitle && (
            <div className="text-sm text-[color:var(--bone-mute)] mono">
              {subtitle}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
