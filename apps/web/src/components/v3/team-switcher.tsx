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
