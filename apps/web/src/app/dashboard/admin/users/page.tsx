'use client';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { Pill } from '@/components/v3/pill';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
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

const ROLE_TONE: Record<string, 'red' | 'blue' | 'amber' | 'green' | 'mute'> = {
  admin: 'red',
  coach: 'blue',
  captain: 'amber',
  athlete: 'green',
};

export default function AdminUsersPage() {
  const sb = useSupabase();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/users?clerk_user_id=${encodeURIComponent(deleteTarget.clerk_user_id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setDeleteError(j.error ?? `delete failed (${res.status})`);
      setDeleting(false);
      return;
    }
    setDeleteTarget(null);
    setDeleting(false);
    await load();
  }

  // Link-athlete dropdown intentionally removed from this page — legacy
  // linkage now happens automatically via the request approve flow's
  // phone+name waterfall, with an inline 'will link to existing roster
  // row' hint surfaced on /dashboard/requests. The PATCH endpoint still
  // accepts impersonate_player_id for the rare disambiguation case;
  // call it directly via the SQL editor or a one-shot fetch if needed.

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamCount = useMemo(() => {
    const s = new Set<number>();
    for (const r of rows) s.add(r.team_id);
    return s.size;
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="Platform admin"
        title="Users"
        subtitle={`${rows.length} users · ${teamCount} teams`}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        <p className="text-[13px] text-[color:var(--ink-mute)] leading-relaxed">
          Read-only overview of every account on the platform. The
          &ldquo;linked athlete&rdquo; column shows which roster row each
          user maps to — assignment happens automatically in the request
          approve flow on <span className="mono">/dashboard/requests</span>.
          Roles can be changed inline; everything else is informational.
        </p>

        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Users</h2>
          </header>
          {loading ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— no users yet —</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <Th>Email</Th>
                    <Th>Name</Th>
                    <Th>Role</Th>
                    <Th>Linked athlete</Th>
                    <Th>Joined</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const linked = u.impersonate_player_id
                      ? playerById.get(u.impersonate_player_id)
                      : null;
                    return (
                      <tr
                        key={u.clerk_user_id}
                        className="border-b"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <Td>
                          {u.email ? (
                            <span className="mono text-[12px] text-[color:var(--ink-mute)]">{u.email}</span>
                          ) : (
                            <span className="text-[12px] text-[color:var(--ink-dim)]">— not loaded —</span>
                          )}
                        </Td>
                        <Td>
                          <span className="text-[color:var(--ink)]">{u.name ?? '—'}</span>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <Pill tone={ROLE_TONE[u.role] ?? 'mute'}>{u.role}</Pill>
                            <Select
                              value={u.role}
                              onValueChange={(v) => setRole(u.clerk_user_id, v)}
                              disabled={busyId === u.clerk_user_id}
                            >
                              <SelectTrigger className="w-28 h-8 text-[12px]">
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
                          {linked ? (
                            <span className="text-[13px] text-[color:var(--ink)]">
                              {linked.name}
                              {linked.group && (
                                <span className="text-[color:var(--ink-mute)]"> · {linked.group}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[12px] text-[color:var(--ink-dim)]">— unlinked —</span>
                          )}
                        </Td>
                        <Td>
                          <span className="mono text-[12px] text-[color:var(--ink-mute)] tabular whitespace-nowrap">
                            {prettyDate(u.created_at)}
                          </span>
                        </Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => { setDeleteError(null); setDeleteTarget(u); }}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-[color:var(--ink-mute)] hover:bg-red-50 hover:text-red-600 transition"
                            aria-label={`Delete ${u.email ?? u.clerk_user_id}`}
                            title="Delete user"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
            <DialogDescription>
              This permanently removes the account from the platform and from
              Clerk. The roster (player) row is preserved, so this person can
              re-onboard with the same phone if they want back in.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-md border bg-[color:var(--card-mute)] px-3 py-2 text-[13px]" style={{ borderColor: 'var(--border)' }}>
              <div><span className="text-[color:var(--ink-mute)]">Email:</span> <span className="mono">{deleteTarget.email ?? '—'}</span></div>
              <div><span className="text-[color:var(--ink-mute)]">Name:</span> {deleteTarget.name ?? '—'}</div>
              <div><span className="text-[color:var(--ink-mute)]">Role:</span> {deleteTarget.role}</div>
              <div><span className="text-[color:var(--ink-mute)]">Team:</span> #{deleteTarget.team_id}</div>
            </div>
          )}
          {deleteError && (
            <p className="text-[13px] text-red-600">{deleteError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
