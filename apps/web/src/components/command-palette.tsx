'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
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
  Star,
} from 'lucide-react';

export function CommandPalette({ teamId, isAdmin }: { teamId: number; isAdmin: boolean }) {
  const router = useRouter();
  const sb = useSupabase();
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from('players')
        .select('id,name,group,phone_e164')
        .eq('team_id', teamId)
        .order('name');
      if (data) setPlayers(data as Player[]);
    })();
  }, [sb, teamId]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page or search the roster…" />
      <CommandList>
        <CommandEmpty className="px-4 py-6 text-sm mono text-[color:var(--bone-mute)]">
          — no matches —
        </CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go('/dashboard')}>
            <LayoutDashboard />
            <span>Dashboard</span>
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/players')}>
            <Users />
            <span>Athletes</span>
            <CommandShortcut>⌘R</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/fitness')}>
            <Dumbbell />
            <span>Activity</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/events')}>
            <Calendar />
            <span>Schedule</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/athlete')}>
            <UserIcon />
            <span>My view</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/settings')}>
            <Settings />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>

        {isAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Administration">
              <CommandItem onSelect={() => go('/dashboard/admin')}>
                <Shield />
                <span>Admin</span>
              </CommandItem>
              <CommandItem onSelect={() => go('/dashboard/admin/users')}>
                <Users />
                <span>Users</span>
              </CommandItem>
              <CommandItem onSelect={() => go('/dashboard/admin/system')}>
                <Activity />
                <span>System</span>
              </CommandItem>
              <CommandItem onSelect={() => go('/dashboard/admin/database')}>
                <Database />
                <span>Database</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {players.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Athletes">
              {players.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.group ?? ''} ${p.phone_e164}`}
                  onSelect={() => go(`/dashboard/player/${p.id}`)}
                >
                  <Star className="opacity-70" />
                  <span>{p.name}</span>
                  {p.group && (
                    <span className="ml-auto mono text-[0.7rem] uppercase tracking-wider text-[color:var(--bone-mute)]">
                      {p.group}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
