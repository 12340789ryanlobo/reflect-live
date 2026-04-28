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
} from '@/components/ui/sidebar';
import { Brand } from './v3/brand';
import { Pill } from './v3/pill';
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
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1.5 transition hover:opacity-90">
          <Brand size="md" />
        </Link>
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <Pill tone={rolePill.tone}>{rolePill.label}</Pill>
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
