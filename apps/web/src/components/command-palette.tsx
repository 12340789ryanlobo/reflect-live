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
      const { data } = await sb.from('players').select('id,name,group,phone_e164').eq('team_id', teamId).order('name');
      if (data) setPlayers(data as Player[]);
    })();
  }, [sb, teamId]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a player name or jump to a page…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go('/dashboard')}>
            <LayoutDashboard />
            <span>Dashboard</span>
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/players')}>
            <Users />
            <span>Players</span>
            <CommandShortcut>G P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/fitness')}>
            <Dumbbell />
            <span>Fitness</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/events')}>
            <Calendar />
            <span>Events</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/dashboard/athlete')}>
            <UserIcon />
            <span>Athlete view</span>
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
                <span>Admin overview</span>
              </CommandItem>
              <CommandItem onSelect={() => go('/dashboard/admin/users')}>
                <Users />
                <span>Users & roles</span>
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
            <CommandGroup heading="Players">
              {players.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.group ?? ''} ${p.phone_e164}`}
                  onSelect={() => go(`/dashboard/player/${p.id}`)}
                >
                  <Star className="opacity-70" />
                  <span>{p.name}</span>
                  {p.group && <span className="ml-auto text-xs text-muted-foreground">{p.group}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
