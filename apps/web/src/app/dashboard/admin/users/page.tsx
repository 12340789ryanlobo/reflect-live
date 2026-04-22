'use client';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { prettyDate } from '@/lib/format';

interface UserRow {
  clerk_user_id: string;
  email: string | null;
  name: string | null;
  role: string;
  team_id: number;
  impersonate_player_id: number | null;
  created_at: string;
}

const ROLE_TONE: Record<string, 'flag' | 'on' | 'watch' | 'live' | 'quiet'> = {
  admin: 'flag',
  coach: 'live',
  captain: 'watch',
  athlete: 'on',
};

export default function AdminUsersPage() {
  const sb = useSupabase();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [userRes, { data: playerData }] = await Promise.all([
      fetch('/api/users'),
      sb.from('players').select('*').order('name'),
    ]);
    const j = await userRes.json();
    setRows(j.users ?? []);
    setPlayers((playerData ?? []) as Player[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function setRole(id: string, role: string) {
    setBusyId(id);
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clerk_user_id: id, role }),
    });
    await load();
    setBusyId(null);
  }

  async function setLinkedPlayer(id: string, playerId: number | null) {
    setBusyId(id);
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clerk_user_id: id, impersonate_player_id: playerId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Failed to update linked player');
    }
    await load();
    setBusyId(null);
  }

  const playersByTeam = useMemo(() => {
    const map = new Map<number, Player[]>();
    for (const p of players) {
      const arr = map.get(p.team_id) ?? [];
      arr.push(p);
      map.set(p.team_id, arr);
    }
    return map;
  }, [players]);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  return (
    <>
      <PageHeader
        eyebrow="Users & roles"
        title="Users"
        italic="& roles."
        subtitle={`${rows.length} USERS · ${playersByTeam.size} TEAMS`}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        <p className="mono text-[0.72rem] leading-relaxed text-[color:var(--bone-mute)]">
          Roles take effect immediately. Users can&rsquo;t change their own role. Linking a user
          to a roster player gives them a personal athlete view — useful when a coach or admin
          is also on the roster.
        </p>

        <section className="reveal reveal-1 panel overflow-hidden">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag name="Users" />
          </div>
          {loading ? (
            <p className="px-6 py-8 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — loading —
            </p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-8 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — no users yet —
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--hairline)] bg-[color:var(--panel-raised)]/40">
                    <Th>Email</Th>
                    <Th>Name</Th>
                    <Th>Role</Th>
                    <Th>Linked athlete</Th>
                    <Th>Joined</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const teamPlayers = playersByTeam.get(u.team_id) ?? [];
                    const linked = u.impersonate_player_id
                      ? playerById.get(u.impersonate_player_id)
                      : null;
                    return (
                      <tr
                        key={u.clerk_user_id}
                        className="border-b border-[color:var(--hairline)]/50"
                      >
                        <Td>
                          {u.email ? (
                            <span className="mono text-[0.72rem] text-[color:var(--bone-soft)]">
                              {u.email}
                            </span>
                          ) : (
                            <span className="mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                              — not loaded —
                            </span>
                          )}
                        </Td>
                        <Td>
                          <span className="text-[color:var(--bone)]">{u.name ?? '—'}</span>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <Stamp tone={ROLE_TONE[u.role] ?? 'quiet'}>{u.role}</Stamp>
                            <Select
                              value={u.role}
                              onValueChange={(v) => setRole(u.clerk_user_id, v)}
                              disabled={busyId === u.clerk_user_id}
                            >
                              <SelectTrigger className="w-28 h-8 mono text-[0.7rem] uppercase tracking-wider">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="coach">Coach</SelectItem>
                                <SelectItem value="captain">Captain</SelectItem>
                                <SelectItem value="athlete">Athlete</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </Td>
                        <Td>
                          <Select
                            value={
                              u.impersonate_player_id ? String(u.impersonate_player_id) : '__none__'
                            }
                            onValueChange={(v) =>
                              setLinkedPlayer(u.clerk_user_id, v === '__none__' ? null : Number(v))
                            }
                            disabled={busyId === u.clerk_user_id || teamPlayers.length === 0}
                          >
                            <SelectTrigger className="w-56 h-8 mono text-[0.72rem]">
                              <SelectValue placeholder="— none —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— none —</SelectItem>
                              {teamPlayers.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.name} {p.group ? `· ${p.group}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {linked && (
                            <div className="mono text-[0.6rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)] mt-1">
                              linked → {linked.name}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <span className="mono text-[0.7rem] text-[color:var(--bone-mute)] tabular whitespace-nowrap">
                            {prettyDate(u.created_at)}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
