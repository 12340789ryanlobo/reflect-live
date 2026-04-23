'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { SectionTag } from '@/components/section-tag';
import { useSupabase } from '@/lib/supabase-browser';
import type { ActivityLog, Player, Location } from '@reflect-live/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { prettyCategory, prettyDate, relativeTime } from '@/lib/format';

const DAY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: 'Year' },
];

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

interface ActivityWithPlayer extends ActivityLog {
  player: { name: string; group: string | null } | null;
}

export default function FitnessPage() {
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [logs, setLogs] = useState<ActivityWithPlayer[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Array<Location & { daysUntil: number }>>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'all' | 'workout' | 'rehab'>('all');

  useEffect(() => {
    (async () => {
      const [{ data: ps }, { data: locs }] = await Promise.all([
        sb.from('players').select('*').eq('team_id', prefs.team_id),
        sb.from('locations').select('*').eq('team_id', prefs.team_id),
      ]);
      setPlayers((ps ?? []) as Player[]);
      const upcoming = ((locs ?? []) as Location[])
        .filter((l) => l.kind === 'meet' && l.event_date)
        .map((l) => ({
          ...l,
          daysUntil: Math.round((new Date(l.event_date!).getTime() - Date.now()) / 86400000),
        }))
        .filter((l) => l.daysUntil >= 0)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      setLocations(upcoming);
    })();
  }, [sb, prefs.team_id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data } = await sb
        .from('activity_logs')
        .select('*, player:players(name, group)')
        .eq('team_id', prefs.team_id)
        .gte('logged_at', since)
        .order('logged_at', { ascending: false })
        .limit(300);
      setLogs((data ?? []) as ActivityWithPlayer[]);
      setLoading(false);
    })();
  }, [sb, prefs.team_id, days]);

  const workoutCount = logs.filter((l) => l.kind === 'workout').length;
  const rehabCount = logs.filter((l) => l.kind === 'rehab').length;
  const activeLoggers = useMemo(() => new Set(logs.map((l) => l.player_id)).size, [logs]);
  const avgPerPlayer = players.length ? Math.round((logs.length / players.length) * 10) / 10 : 0;

  const filtered = kindFilter === 'all' ? logs : logs.filter((l) => l.kind === kindFilter);
  const daysShort = DAY_OPTIONS.find((o) => Number(o.value) === days)?.label ?? `${days}d`;

  return (
    <>
      <PageHeader
        eyebrow="Workouts & rehabs"
        title="Activity"
        subtitle={`${logs.length} ENTRIES · ${daysShort.toUpperCase()}`}
        right={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[140px] h-9 mono text-xs uppercase tracking-wider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  Last {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* Top readouts */}
        <section className="reveal reveal-1 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag name="Workload telemetry" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 md:grid-cols-4">
            <StatReadout label="Workouts" value={workoutCount} sub={daysShort.toUpperCase()} tone="chlorine" />
            <StatReadout label="Rehabs" value={rehabCount} sub={daysShort.toUpperCase()} tone="amber" />
            <StatReadout
              label="Active loggers"
              value={activeLoggers}
              sub={`OF ${players.length} ATHLETES`}
              tone="signal"
            />
            <StatReadout
              label="Avg per athlete"
              value={avgPerPlayer}
              sub={daysShort.toUpperCase()}
              tone="heritage"
            />
          </div>
        </section>

        {/* Upcoming competitions row */}
        {locations.length > 0 && (
          <section className="reveal reveal-2 panel">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag
                name="Upcoming competitions"
                right={
                  <Link
                    href="/dashboard/events"
                    className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--signal)] hover:text-[color:var(--bone)] transition"
                  >
                    ALL EVENTS →
                  </Link>
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-0 md:grid-cols-4">
              {locations.slice(0, 4).map((l, i) => (
                <div
                  key={l.id}
                  className={`p-5 ${i < locations.length - 1 ? 'border-r border-[color:var(--hairline)]' : ''}`}
                >
                  <div className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                    EVT · {String(l.id).padStart(3, '0')}
                  </div>
                  <div className="mt-2 text-sm font-semibold leading-tight line-clamp-2">
                    {l.name}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="num-display text-[2.2rem] leading-none tabular">
                      {l.daysUntil}
                    </span>
                    <span className="mono text-xs text-[color:var(--bone-mute)]">d</span>
                  </div>
                  <div className="mono text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                    UNTIL {prettyDate(l.event_date!).toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* How-to card */}
        <section className="reveal reveal-3 panel border-dashed p-5">
          <SectionTag name="How athletes log" />
          <p className="mt-2 text-sm text-[color:var(--bone-soft)] leading-relaxed">
            Text the team line. Start the message with{' '}
            <code className="mono bg-[color:var(--panel-raised)] px-1.5 py-0.5 text-[color:var(--signal)]">Workout:</code>{' '}
            or{' '}
            <code className="mono bg-[color:var(--panel-raised)] px-1.5 py-0.5 text-[color:var(--amber)]">Rehab:</code>{' '}
            followed by a description.
          </p>
          <div className="mt-4 border-l-2 border-[color:var(--signal)] bg-[color:var(--panel-raised)]/50 p-4 mono text-xs text-[color:var(--bone-soft)] leading-relaxed">
            <div className="text-[color:var(--bone-dim)] mb-1.5 text-[0.62rem] uppercase tracking-[0.22em]">Examples</div>
            Workout: erg 5x500 @ 2k pace, 1k warmdown
            <br />
            Rehab: foam roll quads + hip flexors, 20 min
          </div>
        </section>

        {/* Log table */}
        <section className="reveal reveal-4 panel overflow-hidden">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag
              name={`Past activity · ${filtered.length} entries`}
              right={
                <Select
                  value={kindFilter}
                  onValueChange={(v) => setKindFilter(v as typeof kindFilter)}
                >
                  <SelectTrigger className="w-[140px] h-9 mono text-xs uppercase tracking-wider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All kinds</SelectItem>
                    <SelectItem value="workout">Workouts</SelectItem>
                    <SelectItem value="rehab">Rehabs</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          </div>
          {loading ? (
            <p className="px-6 py-8 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — loading —
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-8 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — no activity logged in this period —
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--hairline)] bg-[color:var(--panel-raised)]/40">
                    <th className="w-[240px] px-4 py-3 text-left mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                      Athlete
                    </th>
                    <th className="w-[110px] px-4 py-3 text-left mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                      When
                    </th>
                    <th className="w-[110px] px-4 py-3 text-left mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                      Kind
                    </th>
                    <th className="px-4 py-3 text-left mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const name = l.player?.name ?? 'Unknown';
                    const tone =
                      l.kind === 'workout'
                        ? { color: 'hsl(162 62% 54%)', bg: 'hsl(162 40% 18% / 0.4)', border: 'hsl(162 40% 40%)' }
                        : { color: 'hsl(38 90% 62%)', bg: 'hsl(38 60% 20% / 0.4)', border: 'hsl(38 60% 40%)' };
                    return (
                      <tr key={l.id} className="border-b border-[color:var(--hairline)]/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-6 place-items-center rounded-sm border border-[color:var(--hairline)] bg-[color:var(--panel-raised)] text-[0.58rem] font-semibold">
                              {l.player ? initials(name) : '?'}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-[color:var(--bone)] truncate">
                                {name}
                              </div>
                              {l.player?.group && (
                                <div className="mono text-[0.6rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)] truncate">
                                  {l.player.group}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 mono text-[0.7rem] text-[color:var(--bone-mute)] tabular" title={prettyDate(l.logged_at)}>
                          {relativeTime(l.logged_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="mono inline-block px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] rounded-sm"
                            style={{
                              color: tone.color,
                              background: tone.bg,
                              border: `1px solid ${tone.border}`,
                            }}
                          >
                            {prettyCategory(l.kind)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm leading-snug text-[color:var(--bone-soft)]">
                          {l.description}
                        </td>
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
