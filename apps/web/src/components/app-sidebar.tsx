'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
} from '@/components/ui/sidebar';
import { BrandMark } from './brand-mark';
import type { UserRole } from '@reflect-live/shared';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  code: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const COACH_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Control room', icon: LayoutDashboard, code: '00' },
  { href: '/dashboard/players', label: 'The roster', icon: Users, code: '01' },
  { href: '/dashboard/fitness', label: 'The log', icon: Dumbbell, code: '02' },
  { href: '/dashboard/events', label: 'The calendar', icon: Calendar, code: '03' },
];

const ATHLETE_NAV: NavItem[] = [
  { href: '/dashboard/athlete', label: 'Your lane', icon: UserIcon, code: '00' },
  { href: '/dashboard/athlete#messages', label: 'Your messages', icon: MessageSquareText, code: '01' },
];

const CAPTAIN_NAV: NavItem[] = [
  { href: '/dashboard/captain', label: 'Team pulse', icon: LayoutDashboard, code: '00' },
  { href: '/dashboard/captain/follow-ups', label: 'Follow-ups', icon: Users, code: '01' },
  { href: '/dashboard/events', label: 'The calendar', icon: Calendar, code: '02' },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard/admin', label: 'Overview', icon: Shield, code: 'A0' },
  { href: '/dashboard/admin/users', label: 'Users & roles', icon: Users, code: 'A1' },
  { href: '/dashboard/admin/teams', label: 'Teams', icon: Building2, code: 'A2' },
  { href: '/dashboard/admin/system', label: 'System', icon: Activity, code: 'A3' },
  { href: '/dashboard/admin/database', label: 'Database', icon: Database, code: 'A4' },
];

const ROLE_DETAILS: Record<
  UserRole,
  { label: string; hint: string; color: string; border: string; bg: string }
> = {
  admin:   { label: 'ADMIN',   hint: 'full access',   color: 'hsl(356 82% 62%)', border: 'hsl(356 60% 42%)', bg: 'hsl(356 60% 22% / 0.3)' },
  coach:   { label: 'COACH',   hint: 'team-wide',     color: 'hsl(358 78% 58%)', border: 'hsl(358 60% 42%)', bg: 'hsl(358 40% 22% / 0.3)' },
  captain: { label: 'CAPTAIN', hint: 'team captain',  color: 'hsl(38 90% 62%)',  border: 'hsl(38 60% 42%)',  bg: 'hsl(38 60% 20% / 0.3)'  },
  athlete: { label: 'ATHLETE', hint: 'personal view', color: 'hsl(162 62% 54%)', border: 'hsl(162 40% 40%)', bg: 'hsl(162 40% 18% / 0.3)' },
};

function NavGroupBlock({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="station-code !text-[0.62rem] !tracking-[0.22em] !text-[color:var(--bone-dim)]">
        {group.label}
      </SidebarGroupLabel>
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
                  <Link href={item.href} className="group">
                    <Icon className="size-4" />
                    <span className="flex-1">{item.label}</span>
                    <span
                      className="mono text-[0.62rem] opacity-60 group-hover:opacity-100 transition"
                      style={active ? { color: 'hsl(188 82% 58%)', opacity: 1 } : undefined}
                    >
                      {item.code}
                    </span>
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
  const groups: NavGroup[] = [];

  if (role === 'coach' || role === 'admin') {
    groups.push({ label: 'Team', items: COACH_NAV });
  }
  if (role === 'captain') {
    groups.push({ label: 'Captain', items: CAPTAIN_NAV });
  }
  if (role === 'athlete') {
    groups.push({ label: 'Your view', items: ATHLETE_NAV });
  }
  if (hasLinkedAthlete && role !== 'athlete') {
    groups.push({
      label: 'Also you',
      items: [{ href: '/dashboard/athlete', label: 'Your lane', icon: UserIcon, code: 'ME' }],
    });
  }
  if (role === 'admin') {
    groups.push({ label: 'Administration', items: ADMIN_NAV });
  }

  const roleMeta = ROLE_DETAILS[role];

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-1 py-1.5 transition hover:opacity-90"
        >
          <BrandMark size={30} tone="heritage" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate h-serif text-[1rem] font-semibold tracking-tight text-[color:var(--bone)]">
              reflect<span className="opacity-50">·</span>live
            </span>
            <span className="truncate mono text-[0.62rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
              {teamName ?? 'UChicago Swim & Dive'}
            </span>
          </div>
        </Link>
        <div
          className="mx-1 mt-1 flex items-center justify-between gap-2 rounded-sm border px-2 py-1"
          style={{ borderColor: roleMeta.border, background: roleMeta.bg }}
        >
          <span className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ background: roleMeta.color, boxShadow: `0 0 6px ${roleMeta.color}` }}
            />
            <span
              className="mono text-[0.66rem] font-semibold tracking-[0.22em]"
              style={{ color: roleMeta.color }}
            >
              {roleMeta.label}
            </span>
          </span>
          <span className="mono text-[0.58rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
            {roleMeta.hint}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => (
          <NavGroupBlock key={g.label} group={g} />
        ))}

        <SidebarGroup>
          <SidebarGroupLabel className="station-code !text-[0.62rem] !tracking-[0.22em] !text-[color:var(--bone-dim)]">
            Account
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={usePathname() === '/dashboard/settings'}
                  tooltip="Settings"
                >
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
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-sm">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="rounded-sm bg-sidebar-accent text-sidebar-accent-foreground font-mono text-[0.7rem]">
                  {initials || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate mono text-[0.65rem] text-sidebar-foreground/60">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-60">
            <DropdownMenuLabel className="flex items-center gap-2">
              <Avatar className="h-8 w-8 rounded-sm">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="rounded-sm">{initials || 'U'}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate mono text-[0.65rem] text-muted-foreground">{email}</span>
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
