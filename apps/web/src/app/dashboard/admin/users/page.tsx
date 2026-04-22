'use client';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
  useEffect(() => { load(); }, []);

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
      <PageHeader title="Users & roles" subtitle={<Badge variant="destructive">Admin only</Badge>} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <p className="text-xs text-muted-foreground">
          Roles take effect immediately. Users can&apos;t change their own role. Linking a user to a roster player gives them a personal &ldquo;My athlete view&rdquo; — useful when a coach is also a swimmer.
        </p>
        <Card>
          <CardContent className="px-0">
            {loading ? <p className="p-6 text-sm italic text-muted-foreground">Loading…</p> : rows.length === 0 ? (
              <p className="p-6 text-sm italic text-muted-foreground">No users yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Linked player</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((u) => {
                    const teamPlayers = playersByTeam.get(u.team_id) ?? [];
                    const linked = u.impersonate_player_id ? playerById.get(u.impersonate_player_id) : null;
                    return (
                      <TableRow key={u.clerk_user_id}>
                        <TableCell className="font-mono text-xs">
                          {u.email ?? <span className="text-muted-foreground italic">— (not loaded)</span>}
                        </TableCell>
                        <TableCell>{u.name ?? '—'}</TableCell>
                        <TableCell>
                          <Select value={u.role} onValueChange={(v) => setRole(u.clerk_user_id, v)} disabled={busyId === u.clerk_user_id}>
                            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="coach">Coach</SelectItem>
                              <SelectItem value="captain">Captain</SelectItem>
                              <SelectItem value="athlete">Athlete</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.impersonate_player_id ? String(u.impersonate_player_id) : '__none__'}
                            onValueChange={(v) => setLinkedPlayer(u.clerk_user_id, v === '__none__' ? null : Number(v))}
                            disabled={busyId === u.clerk_user_id || teamPlayers.length === 0}
                          >
                            <SelectTrigger className="w-56 h-8">
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
                          {linked && <div className="text-[10px] text-muted-foreground mt-1">linked to {linked.name}</div>}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{prettyDate(u.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
