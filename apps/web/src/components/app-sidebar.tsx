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
import { Badge } from '@/components/ui/badge';
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
  { href: '/dashboard/players', label: 'Players', icon: Users },
  { href: '/dashboard/fitness', label: 'Fitness', icon: Dumbbell },
  { href: '/dashboard/events', label: 'Events', icon: Calendar },
];

const ATHLETE_NAV: NavItem[] = [
  { href: '/dashboard/athlete', label: 'My dashboard', icon: UserIcon },
  { href: '/dashboard/athlete#messages', label: 'My messages', icon: MessageSquareText },
];

const CAPTAIN_NAV: NavItem[] = [
  { href: '/dashboard/captain', label: 'Team pulse', icon: LayoutDashboard },
  { href: '/dashboard/captain/follow-ups', label: 'Follow-ups', icon: Users },
  { href: '/dashboard/events', label: 'Events', icon: Calendar },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard/admin', label: 'Admin overview', icon: Shield },
  { href: '/dashboard/admin/users', label: 'Users & roles', icon: Users },
  { href: '/dashboard/admin/teams', label: 'Teams', icon: Building2 },
  { href: '/dashboard/admin/system', label: 'System', icon: Activity },
  { href: '/dashboard/admin/database', label: 'Database', icon: Database },
];

const ROLE_DETAILS: Record<UserRole, { label: string; hint: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  admin: { label: 'Admin', hint: 'full access', tone: 'destructive' },
  coach: { label: 'Coach', hint: 'team-wide view', tone: 'default' },
  captain: { label: 'Captain', hint: 'team captain', tone: 'secondary' },
  athlete: { label: 'Athlete', hint: 'personal view', tone: 'outline' },
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

  if (role === 'coach' || role === 'admin') {
    groups.push({ label: 'Team', items: COACH_NAV });
  }
  if (role === 'captain') {
    groups.push({ label: 'Captain', items: CAPTAIN_NAV });
  }
  if (role === 'athlete') {
    groups.push({ label: 'My view', items: ATHLETE_NAV });
  }
  // Dual-role: a staff user (coach/captain/admin) linked to a roster player
  // also gets a personal athlete view link
  if (hasLinkedAthlete && role !== 'athlete') {
    groups.push({ label: 'Also you', items: [{ href: '/dashboard/athlete', label: 'My athlete view', icon: UserIcon }] });
  }
  if (role === 'admin') {
    groups.push({ label: 'Administration', items: ADMIN_NAV });
  }

  const roleMeta = ROLE_DETAILS[role];

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-[hsl(0_100%_40%)] text-white font-serif font-semibold text-sm leading-none">
            rl
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-serif text-base font-semibold">reflect-live</span>
            <span className="truncate text-xs text-sidebar-foreground/70">{teamName ?? 'UChicago Swim & Dive'}</span>
          </div>
        </div>
        <div className="flex items-center justify-between px-1 pb-1">
          <Badge variant={roleMeta.tone} className="gap-1">
            <Shield className="size-3" />
            {roleMeta.label}
          </Badge>
          <span className="text-[10px] text-sidebar-foreground/60 uppercase tracking-wide">{roleMeta.hint}</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => (
          <NavGroupBlock key={g.label} group={g} />
        ))}

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
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                  {initials || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-70" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            className="w-56"
          >
            <DropdownMenuLabel className="flex items-center gap-2">
              <Avatar className="h-8 w-8 rounded-lg">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="rounded-lg">{initials || 'U'}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
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
