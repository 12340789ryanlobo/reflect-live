'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  Calendar,
  Settings,
  Shield,
  Database,
  Activity,
  User as UserIcon,
  MessageSquareText,
  Search,
  LogOut,
  ChevronsUpDown,
  Building2,
  Radio,
  HeartPulse,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Brand } from './v3/brand';
import { Pill } from './v3/pill';
import { cn } from '@/lib/utils';
import type { UserRole } from '@reflect-live/shared';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const COACH_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/live', label: 'Live', icon: Radio },
  { href: '/dashboard/players', label: 'Athletes', icon: Users },
  { href: '/dashboard/fitness', label: 'Activity', icon: Dumbbell },
  { href: '/dashboard/heatmap', label: 'Heatmap', icon: HeartPulse },
  { href: '/dashboard/events', label: 'Schedule', icon: Calendar },
];

const ATHLETE_NAV: NavItem[] = [
  { href: '/dashboard/athlete', label: 'My view', icon: UserIcon },
  { href: '/dashboard/athlete#messages', label: 'My messages', icon: MessageSquareText },
];

const CAPTAIN_NAV: NavItem[] = [
  { href: '/dashboard/captain', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/live', label: 'Live', icon: Radio },
  { href: '/dashboard/captain/follow-ups', label: 'Follow-ups', icon: Users },
  { href: '/dashboard/heatmap', label: 'Heatmap', icon: HeartPulse },
  { href: '/dashboard/events', label: 'Schedule', icon: Calendar },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard/admin', label: 'Admin', icon: Shield },
  { href: '/dashboard/admin/users', label: 'Users', icon: Users },
  { href: '/dashboard/admin/teams', label: 'Teams', icon: Building2 },
  { href: '/dashboard/admin/system', label: 'System', icon: Activity },
  { href: '/dashboard/admin/database', label: 'Database', icon: Database },
];

const ROLE_PILL: Record<UserRole, { tone: 'red' | 'blue' | 'amber' | 'green'; label: string }> = {
  admin:   { tone: 'red',   label: 'Admin' },
  coach:   { tone: 'blue',  label: 'Coach' },
  captain: { tone: 'amber', label: 'Captain' },
  athlete: { tone: 'green', label: 'Athlete' },
};

function NavGroupBlock({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href.split('#')[0]));
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <Link href={item.href}>
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({
  role,
  teamName,
  hasLinkedAthlete,
}: {
  role: UserRole;
  teamName?: string;
  hasLinkedAthlete?: boolean;
}) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const groups: NavGroup[] = [];

  if (role === 'coach' || role === 'admin') groups.push({ label: 'Team', items: COACH_NAV });
  if (role === 'captain') groups.push({ label: 'Captain', items: CAPTAIN_NAV });
  if (role === 'athlete') groups.push({ label: 'Your view', items: ATHLETE_NAV });
  if (hasLinkedAthlete && role !== 'athlete') {
    groups.push({
      label: 'Also you',
      items: [{ href: '/dashboard/athlete', label: 'My view', icon: UserIcon }],
    });
  }
  if (role === 'admin') groups.push({ label: 'Administration', items: ADMIN_NAV });

  const rolePill = ROLE_PILL[role];

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <Link
          href="/dashboard"
          // Keep padding constant across states so the icon doesn't shift
          // horizontally during the collapse animation. The text fade/slide
          // is the only thing that moves; the icon sits at a steady left
          // anchor that's near-centred in the 48px collapsed column.
          className="flex items-center px-2 py-1.5 transition hover:opacity-90"
        >
          <Brand size="md" showText={!collapsed} />
        </Link>
        {/* Role-switcher / team-name row. Always rendered; opacity +
            max-height + padding animate together so the collapse feels
            continuous with the sidebar width transition. */}
        <div
          className={cn(
            'flex items-center justify-between gap-2 px-2 overflow-hidden transition-all duration-200 ease-out',
            collapsed ? 'opacity-0 max-h-0 pb-0' : 'opacity-100 max-h-12 pb-2',
          )}
          aria-hidden={collapsed}
        >
          <RoleSwitcher current={role} />
          {teamName && (
            <span className="truncate text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
              {teamName}
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => <NavGroupBlock key={g.label} group={g} />)}

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={usePathname() === '/dashboard/settings'} tooltip="Settings">
                  <Link href="/dashboard/settings">
                    <Settings className="size-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenuBlock />
      </SidebarFooter>
    </Sidebar>
  );
}

function RoleSwitcher({ current }: { current: UserRole }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<UserRole | null>(null);
  const [canSwitch, setCanSwitch] = React.useState<boolean | null>(null);
  const [prefsCache, setPrefsCache] = React.useState<{
    team_id: number;
    watchlist: unknown;
    group_filter: unknown;
    impersonate_player_id: number | null;
  } | null>(null);
  const tone = ROLE_PILL[current].tone;

  // One-time fetch: do we have permission to switch, and what are the prefs
  // we need to preserve on POST?
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const cur = await fetch('/api/preferences')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cancelled) return;
      setCanSwitch(!!cur?.can_switch_role);
      const p = cur?.preferences;
      if (p && typeof p.team_id === 'number') {
        setPrefsCache({
          team_id: p.team_id,
          watchlist: p.watchlist ?? [],
          group_filter: p.group_filter ?? null,
          impersonate_player_id: p.impersonate_player_id ?? null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchTo(next: UserRole) {
    if (next === current || pending || !prefsCache) return;
    setPending(next);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: prefsCache.team_id,
        watchlist: prefsCache.watchlist,
        group_filter: prefsCache.group_filter,
        role: next,
        impersonate_player_id:
          next === 'athlete' ? prefsCache.impersonate_player_id : null,
      }),
    });
    setPending(null);
    // Hard nav to the role's natural landing so the user sees the new view immediately.
    const home =
      next === 'admin' ? '/dashboard/admin'
        : next === 'captain' ? '/dashboard/captain'
        : next === 'athlete' ? '/dashboard/athlete'
        : '/dashboard';
    router.push(home);
    router.refresh();
  }

  // Until we know whether the user can switch, render the static pill
  // (avoids a flash of "switchable then locked"). Non-switchers get the
  // pill permanently with no chevron and no menu.
  if (canSwitch !== true) {
    return <Pill tone={tone}>{ROLE_PILL[current].label}</Pill>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full transition hover:opacity-80 disabled:opacity-50"
          disabled={!!pending}
          aria-label="Switch role view"
        >
          <Pill tone={tone}>{ROLE_PILL[current].label}</Pill>
          <ChevronsUpDown className="size-3 text-[color:var(--ink-mute)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-44">
        <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)]">
          View as
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(['admin', 'coach', 'captain', 'athlete'] as UserRole[]).map((r) => {
          const meta = ROLE_PILL[r];
          return (
            <DropdownMenuItem
              key={r}
              onSelect={(e) => {
                e.preventDefault();
                switchTo(r);
              }}
              className="flex items-center justify-between"
            >
              <span>{meta.label}</span>
              {r === current && (
                <span className="text-[10.5px] text-[color:var(--ink-mute)]">current</span>
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings" className="text-[12.5px] text-[color:var(--ink-mute)]">
            Manage in Settings…
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenuBlock() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const name = user?.fullName ?? user?.firstName ?? 'Account';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const avatarUrl = user?.imageUrl;
  const initials = (name ?? '')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="h-8 w-8 rounded-md">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="rounded-md bg-[color:var(--blue-soft)] text-[color:var(--blue)] font-bold text-[10.5px]">
                  {initials || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-[11.5px] text-[color:var(--ink-mute)]">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-60">
            <DropdownMenuLabel className="flex items-center gap-2">
              <Avatar className="h-8 w-8 rounded-md">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="rounded-md">{initials || 'U'}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-[11.5px] text-[color:var(--ink-mute)]">{email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openUserProfile()}>
              <UserIcon className="size-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="size-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
                document.dispatchEvent(ev);
              }}
            >
              <Search className="size-4" />
              <span>Command menu</span>
              <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOut({ redirectUrl: '/' })}>
              <LogOut className="size-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
