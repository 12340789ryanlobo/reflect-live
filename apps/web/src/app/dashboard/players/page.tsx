'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Star, Trash2, Search } from 'lucide-react';
import { prettyPhone, relativeTime } from '@/lib/format';

interface PlayerRow extends Player {
  last_inbound: string | null;
  workouts_30d: number;
  rehabs_30d: number;
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
  const isAdmin = role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const { data: players } = await sb
      .from('players')
      .select('*')
      .eq('team_id', prefs.team_id)
      .order('name');
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: msgs } = await sb
      .from('twilio_messages')
      .select('player_id,direction,category,date_sent')
      .eq('team_id', prefs.team_id)
      .gte('date_sent', since30);
    const msgList =
      (msgs ?? []) as Array<{
        player_id: number | null;
        direction: string;
        category: string;
        date_sent: string;
      }>;

    const lastInboundByPlayer = new Map<number, string>();
    const workoutByPlayer = new Map<number, number>();
    const rehabByPlayer = new Map<number, number>();
    for (const m of msgList) {
      if (m.player_id == null) continue;
      if (m.direction === 'inbound') {
        const prev = lastInboundByPlayer.get(m.player_id);
        if (!prev || m.date_sent > prev) lastInboundByPlayer.set(m.player_id, m.date_sent);
      }
      if (m.category === 'workout')
        workoutByPlayer.set(m.player_id, (workoutByPlayer.get(m.player_id) ?? 0) + 1);
      if (m.category === 'rehab')
        rehabByPlayer.set(m.player_id, (rehabByPlayer.get(m.player_id) ?? 0) + 1);
    }

    const enriched: PlayerRow[] = (players ?? []).map((p: Player) => ({
      ...p,
      last_inbound: lastInboundByPlayer.get(p.id) ?? null,
      workouts_30d: workoutByPlayer.get(p.id) ?? 0,
      rehabs_30d: rehabByPlayer.get(p.id) ?? 0,
    }));
    setRows(enriched);
    setLoading(false);
  }, [sb, prefs.team_id]);

  useEffect(() => {
    load();
  }, [load]);

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
        const matches =
          r.name.toLowerCase().includes(q) ||
          rawPhone.includes(q) ||
          prettified.includes(q);
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
        subtitle={`${rows.length} · ${groups.length} GROUPS`}
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* Top telemetry */}
        <section className="reveal reveal-1 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag name="Roster summary" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 md:grid-cols-4">
            <StatReadout label="Roster" value={rows.length} sub={`${groups.length} GROUPS`} tone="heritage" />
            <StatReadout
              label="Active this month"
              value={activeCount}
              sub="REPLIED · 30D"
              tone="chlorine"
            />
            <StatReadout
              label="Quiet"
              value={rows.length - activeCount}
              sub="NO REPLIES · 30D"
              tone={rows.length - activeCount > 0 ? 'amber' : 'default'}
            />
            <StatReadout
              label="Starred"
              value={prefs.watchlist.length}
              sub="ON YOUR WATCHLIST"
              tone="signal"
            />
          </div>
        </section>

        {/* Heat sheet */}
        <section className="reveal reveal-2 panel overflow-hidden">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag
              name={`Heat sheet · ${filtered.length} shown`}
              right={
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--bone-dim)]" />
                    <Input
                      type="search"
                      placeholder="name / phone"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-[200px] h-9 pl-8 mono text-xs"
                    />
                  </div>
                  <Select value={group} onValueChange={setGroup}>
                    <SelectTrigger className="w-[140px] h-9 mono text-xs uppercase tracking-wider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All groups</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
            />
          </div>

          {loading ? (
            <p className="px-6 py-8 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — loading roster —
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-8 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — no athletes match this filter —
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--hairline)] bg-[color:var(--panel-raised)]/40">
                    <Th className="w-12">Ln</Th>
                    <Th>Athlete</Th>
                    <Th>Group</Th>
                    <Th>Phone</Th>
                    <Th right>Status</Th>
                    <Th right>Last reply</Th>
                    <Th right>Workouts</Th>
                    <Th right>Rehabs</Th>
                    <Th right>Star</Th>
                    {isAdmin && <Th></Th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => {
                    const starred = prefs.watchlist.includes(p.id);
                    const hrs = hoursSince(p.last_inbound);
                    const stampTone =
                      hrs == null ? 'quiet' : hrs < 1 ? 'live' : hrs < 24 ? 'on' : hrs < 72 ? 'watch' : 'quiet';
                    const stampText =
                      hrs == null ? 'quiet' : hrs < 1 ? 'live' : hrs < 24 ? 'on wire' : hrs < 72 ? 'watch' : 'quiet';
                    return (
                      <tr
                        key={p.id}
                        className="group cursor-pointer border-b border-[color:var(--hairline)]/50 transition hover:bg-[color:var(--panel-raised)]/50"
                        onClick={() => router.push(`/dashboard/player/${p.id}`)}
                      >
                        <Td>
                          <span className="mono text-[0.66rem] text-[color:var(--bone-dim)] tabular">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-7 place-items-center rounded-sm border border-[color:var(--hairline)] bg-[color:var(--panel-raised)] text-[0.62rem] font-semibold">
                              {initials(p.name)}
                            </span>
                            <span className="font-semibold text-[color:var(--bone)] group-hover:text-[color:var(--signal)] transition">
                              {p.name}
                            </span>
                          </div>
                        </Td>
                        <Td>
                          {p.group ? (
                            <span className="mono text-[0.66rem] uppercase tracking-[0.16em] text-[color:var(--bone-soft)]">
                              {p.group}
                            </span>
                          ) : (
                            <span className="mono text-[0.66rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                              —
                            </span>
                          )}
                        </Td>
                        <Td>
                          <span className="mono text-[0.7rem] text-[color:var(--bone-mute)] tabular">
                            {prettyPhone(p.phone_e164)}
                          </span>
                        </Td>
                        <Td right>
                          <Stamp tone={stampTone} rotate={i % 2 === 0 ? -1.5 : 1.5}>
                            {stampText}
                          </Stamp>
                        </Td>
                        <Td right>
                          <span className="mono text-[0.72rem] text-[color:var(--bone-soft)] tabular">
                            {p.last_inbound ? relativeTime(p.last_inbound) : '—'}
                          </span>
                        </Td>
                        <Td right>
                          <span className="num-display text-lg tabular" style={{ color: p.workouts_30d ? 'hsl(162 62% 54%)' : 'hsl(220 16% 34%)' }}>
                            {p.workouts_30d}
                          </span>
                        </Td>
                        <Td right>
                          <span className="num-display text-lg tabular" style={{ color: p.rehabs_30d ? 'hsl(38 90% 62%)' : 'hsl(220 16% 34%)' }}>
                            {p.rehabs_30d}
                          </span>
                        </Td>
                        <Td right>
                          {starred ? (
                            <Star className="size-4 fill-[color:var(--signal)] text-[color:var(--signal)] inline" />
                          ) : (
                            <Star className="size-4 text-[color:var(--bone-dim)] inline" />
                          )}
                        </Td>
                        {isAdmin && (
                          <Td right>
                            <button
                              onClick={(e) => deletePlayer(p, e)}
                              disabled={deletingId === p.id}
                              className="rounded-sm p-1.5 text-[color:var(--bone-dim)] hover:bg-[color:var(--siren-ghost)] hover:text-[color:var(--siren)] transition disabled:opacity-50"
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
    </>
  );
}

function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th
      className={`px-4 py-3 mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)] ${
        right ? 'text-right' : 'text-left'
      } ${className ?? ''}`}
    >
      {children}
    </th>
  );
}
function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-3 ${right ? 'text-right' : ''}`}>{children}</td>;
}
