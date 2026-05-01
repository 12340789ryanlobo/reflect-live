'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { Pill } from '@/components/v3/pill';
import { EditAthleteDialog } from '@/components/v3/edit-athlete-dialog';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Search, Plus } from 'lucide-react';
import { prettyPhone, relativeTime } from '@/lib/format';

interface PlayerRow extends Player {
  last_inbound: string | null;
  workouts_30d: number;
  rehabs_30d: number;
  membership_role: 'captain' | 'athlete' | null;
  has_linked_membership: boolean;
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export default function PlayersPage() {
  const { prefs, role } = useDashboard();
  const sb = useSupabase();
  const router = useRouter();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<PlayerRow | null>(null);
  const isAdmin = role === 'admin';
  // Coach-or-better can edit roster (group + captain). Mirrors the
  // server-side requireRosterManager gate on PATCH /api/players/[id].
  const canEditRoster = role === 'coach' || role === 'admin' || prefs.is_platform_admin === true;

  const load = useCallback(async () => {
    setLoading(true);
    const { data: players } = await sb.from('players').select('*').eq('team_id', prefs.team_id).order('name');
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [{ data: msgs }, { data: mems }] = await Promise.all([
      sb.from('twilio_messages').select('player_id,direction,category,date_sent').eq('team_id', prefs.team_id).gte('date_sent', since30),
      sb.from('team_memberships').select('player_id,role,status').eq('team_id', prefs.team_id).eq('status', 'active'),
    ]);
    const msgList = (msgs ?? []) as Array<{ player_id: number | null; direction: string; category: string; date_sent: string }>;
    const lastInboundByPlayer = new Map<number, string>();
    const workoutByPlayer = new Map<number, number>();
    const rehabByPlayer = new Map<number, number>();
    for (const m of msgList) {
      if (m.player_id == null) continue;
      if (m.direction === 'inbound') {
        const prev = lastInboundByPlayer.get(m.player_id);
        if (!prev || m.date_sent > prev) lastInboundByPlayer.set(m.player_id, m.date_sent);
      }
      if (m.category === 'workout') workoutByPlayer.set(m.player_id, (workoutByPlayer.get(m.player_id) ?? 0) + 1);
      if (m.category === 'rehab') rehabByPlayer.set(m.player_id, (rehabByPlayer.get(m.player_id) ?? 0) + 1);
    }
    const memByPlayer = new Map<number, 'captain' | 'athlete'>();
    for (const m of (mems ?? []) as Array<{ player_id: number | null; role: string; status: string }>) {
      if (m.player_id == null) continue;
      memByPlayer.set(m.player_id, m.role === 'captain' ? 'captain' : 'athlete');
    }
    const enriched: PlayerRow[] = (players ?? []).map((p: Player) => ({
      ...p,
      last_inbound: lastInboundByPlayer.get(p.id) ?? null,
      workouts_30d: workoutByPlayer.get(p.id) ?? 0,
      rehabs_30d: rehabByPlayer.get(p.id) ?? 0,
      membership_role: memByPlayer.get(p.id) ?? null,
      has_linked_membership: memByPlayer.has(p.id),
    }));
    setRows(enriched);
    setLoading(false);
  }, [sb, prefs.team_id]);

  useEffect(() => { load(); }, [load]);

  async function deletePlayer(p: PlayerRow, ev: React.MouseEvent) {
    ev.stopPropagation();
    const hasActivity = p.workouts_30d + p.rehabs_30d > 0 || p.last_inbound != null;
    const warning = hasActivity
      ? `Delete ${p.name}? Their activity logs will be removed and their Twilio messages will be kept but unlinked. This is permanent.`
      : `Delete ${p.name}? No messages or workouts are linked. Quick clean-up.`;
    if (!confirm(warning)) return;
    setDeletingId(p.id);
    const res = await fetch(`/api/players/${p.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Delete failed.');
    }
    await load();
    setDeletingId(null);
  }

  const groups = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.group) s.add(r.group);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (group !== 'all' && r.group !== group) return false;
      if (q) {
        const rawPhone = (r.phone_e164 ?? '').toLowerCase();
        const prettified = prettyPhone(r.phone_e164).toLowerCase();
        const matches = r.name.toLowerCase().includes(q) || rawPhone.includes(q) || prettified.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [rows, search, group]);

  const activeCount = rows.filter((r) => r.last_inbound).length;

  return (
    <>
      <PageHeader
        eyebrow="Roster"
        title="Athletes"
        subtitle={`${rows.length} · ${groups.length} groups`}
      />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6"><StatCell label="Roster" value={rows.length} sub={`${groups.length} groups`} /></div>
            <div className="p-6"><StatCell label="Active" value={activeCount} sub="replied · 30d" tone="green" /></div>
            <div className="p-6"><StatCell label="Quiet" value={rows.length - activeCount} sub="no replies · 30d" tone={rows.length - activeCount > 0 ? 'amber' : 'default'} /></div>
          </div>
        </section>

        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Roster · {filtered.length}</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--ink-mute)]" />
                <Input
                  type="search"
                  placeholder="name / phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-[200px] h-9 pl-8 text-[13px]"
                />
              </div>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger className="w-[140px] h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </header>

          {loading ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— no matches —</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <Th>Name</Th>
                    <Th>Group</Th>
                    <Th>Phone</Th>
                    {isAdmin && <Th>Gender</Th>}
                    <Th right>Last reply</Th>
                    <Th right>Workouts</Th>
                    <Th right>Rehabs</Th>
                    {isAdmin && <Th></Th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const hrs = hoursSince(p.last_inbound);
                    const tone = hrs == null ? 'mute' : hrs < 1 ? 'green' : hrs < 24 ? 'green' : hrs < 72 ? 'amber' : 'mute';
                    return (
                      <tr
                        key={p.id}
                        className="border-b cursor-pointer transition hover:bg-[color:var(--card-hover)]"
                        style={{ borderColor: 'var(--border)' }}
                        onClick={() => router.push(`/dashboard/players/${p.id}`)}
                      >
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-7 place-items-center rounded-md border bg-[color:var(--paper)] text-[10px] font-bold" style={{ borderColor: 'var(--border)' }}>
                              {initials(p.name)}
                            </span>
                            <span className="font-semibold text-[color:var(--ink)]">{p.name}</span>
                            {p.membership_role === 'captain' && (
                              <Pill tone="amber">Captain</Pill>
                            )}
                          </div>
                        </Td>
                        <Td>
                          {canEditRoster ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditTarget(p); }}
                              aria-label={`Edit ${p.name}`}
                              className="rounded-md transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)] focus:ring-offset-1 focus:ring-offset-[color:var(--card)]"
                            >
                              {p.group ? (
                                <Pill tone="mute" className="cursor-pointer hover:bg-[color:var(--blue-soft)] hover:text-[color:var(--blue)] transition">
                                  {p.group}
                                </Pill>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-dim)] hover:text-[color:var(--blue)] transition cursor-pointer">
                                  <Plus className="size-3" />
                                  Add group
                                </span>
                              )}
                            </button>
                          ) : (
                            p.group ? <Pill tone="mute">{p.group}</Pill> : <span className="text-[color:var(--ink-mute)]">—</span>
                          )}
                        </Td>
                        <Td><span className="mono text-[12px] text-[color:var(--ink-mute)]">{prettyPhone(p.phone_e164)}</span></Td>
                        {isAdmin && (
                          <Td>
                            <GenderCell player={p} onChanged={load} />
                          </Td>
                        )}
                        <Td right>
                          <span className="text-[12px]" style={{ color: tone === 'amber' ? 'var(--amber)' : tone === 'mute' ? 'var(--ink-mute)' : 'var(--ink-soft)' }}>
                            {p.last_inbound ? relativeTime(p.last_inbound) : '—'}
                          </span>
                        </Td>
                        <Td right>
                          <span className="font-semibold tabular" style={{ color: p.workouts_30d ? 'var(--green)' : 'var(--ink-dim)' }}>
                            {p.workouts_30d}
                          </span>
                        </Td>
                        <Td right>
                          <span className="font-semibold tabular" style={{ color: p.rehabs_30d ? 'var(--amber)' : 'var(--ink-dim)' }}>
                            {p.rehabs_30d}
                          </span>
                        </Td>
                        {isAdmin && (
                          <Td right>
                            <button
                              onClick={(e) => deletePlayer(p, e)}
                              disabled={deletingId === p.id}
                              className="rounded-md p-1.5 text-[color:var(--ink-dim)] hover:bg-[color:var(--red-soft)] hover:text-[color:var(--red)] transition disabled:opacity-50"
                              aria-label={`Delete ${p.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      {editTarget && (
        <EditAthleteDialog
          open={Boolean(editTarget)}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          player={{ id: editTarget.id, name: editTarget.name, group: editTarget.group }}
          knownGroups={groups}
          hasLinkedMembership={editTarget.has_linked_membership}
          membershipRole={editTarget.membership_role}
          onSaved={() => { void load(); }}
        />
      )}
    </>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-3 ${right ? 'text-right' : ''}`}>{children}</td>;
}

function GenderCell({ player, onChanged }: { player: PlayerRow; onChanged: () => void | Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function update(next: 'male' | 'female' | null) {
    if (next === player.gender) return;
    setSaving(true);
    await fetch(`/api/players/${player.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gender: next }),
    });
    setSaving(false);
    await onChanged();
  }
  return (
    <Select
      value={player.gender ?? 'unset'}
      onValueChange={(v) => update(v === 'unset' ? null : (v as 'male' | 'female'))}
      disabled={saving}
    >
      <SelectTrigger
        className="h-8 w-[120px] text-[12px]"
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        <SelectItem value="unset">— team default —</SelectItem>
        <SelectItem value="male">Male</SelectItem>
        <SelectItem value="female">Female</SelectItem>
      </SelectContent>
    </Select>
  );
}
