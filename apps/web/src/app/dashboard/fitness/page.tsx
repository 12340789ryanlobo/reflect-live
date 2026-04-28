'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { Pill } from '@/components/v3/pill';
import { Leaderboard } from '@/components/v3/leaderboard';
import { useSupabase } from '@/lib/supabase-browser';
import { computeLeaderboard, weekStartCT, type LeaderboardRow } from '@/lib/scoring';
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
  const { prefs, team, role } = useDashboard();
  const sb = useSupabase();
  const [logs, setLogs] = useState<ActivityWithPlayer[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Array<Location & { daysUntil: number }>>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'all' | 'workout' | 'rehab'>('all');
  const [weekRows, setWeekRows] = useState<LeaderboardRow[]>([]);
  const [allTimeRows, setAllTimeRows] = useState<LeaderboardRow[]>([]);
  const [deleting, setDeleting] = useState<number | null>(null);
  const canDelete = role === 'coach' || role === 'admin';

  async function deleteLog(id: number) {
    if (deleting !== null) return;
    if (!confirm('Hide this entry from the leaderboard? You can\'t undo this from the UI.')) return;
    setDeleting(id);
    const res = await fetch(`/api/activity-logs/${id}`, { method: 'DELETE' });
    setDeleting(null);
    if (res.ok) {
      setLogs((cur) => cur.filter((l) => l.id !== id));
      // Re-fetch leaderboards so points reflect the deletion immediately.
      const scoring = team.scoring_json;
      const sinceISO = weekStartCT().toISOString();
      const [week, allTime] = await Promise.all([
        computeLeaderboard(sb, prefs.team_id, scoring, sinceISO),
        computeLeaderboard(sb, prefs.team_id, scoring),
      ]);
      setWeekRows(week);
      setAllTimeRows(allTime);
    } else {
      alert('Delete failed.');
    }
  }

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
        .in('kind', ['workout', 'rehab'])
        .eq('hidden', false)
        .gte('logged_at', since)
        .order('logged_at', { ascending: false })
        .limit(300);
      setLogs((data ?? []) as ActivityWithPlayer[]);
      setLoading(false);
    })();
  }, [sb, prefs.team_id, days]);

  const workoutScore = team.scoring_json.workout_score;
  const rehabScore = team.scoring_json.rehab_score;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scoring = { workout_score: workoutScore, rehab_score: rehabScore };
      const sinceISO = weekStartCT().toISOString();
      const [week, allTime] = await Promise.all([
        computeLeaderboard(sb, prefs.team_id, scoring, sinceISO),
        computeLeaderboard(sb, prefs.team_id, scoring),
      ]);
      if (cancelled) return;
      setWeekRows(week);
      setAllTimeRows(allTime);
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, prefs.team_id, workoutScore, rehabScore]);

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
        subtitle={`${logs.length} entries · ${daysShort}`}
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[140px] h-9 text-[13px]">
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

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Top stats row */}
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6"><StatCell label="Workouts" value={workoutCount} sub={daysShort} tone="green" /></div>
            <div className="p-6"><StatCell label="Rehabs" value={rehabCount} sub={daysShort} tone="amber" /></div>
            <div className="p-6"><StatCell label="Active loggers" value={activeLoggers} sub={`of ${players.length} athletes`} tone="blue" /></div>
            <div className="p-6"><StatCell label="Avg per athlete" value={avgPerPlayer} sub={daysShort} /></div>
          </div>
        </section>

        {/* Upcoming competitions */}
        {locations.length > 0 && (
          <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Upcoming competitions</h2>
              <Link
                href="/dashboard/events"
                className="text-[13px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition"
              >
                All events →
              </Link>
            </header>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
              {locations.slice(0, 4).map((l) => (
                <div key={l.id} className="p-5">
                  <div className="mono text-[11px] font-semibold uppercase tracking-widest text-[color:var(--ink-mute)]">
                    EVT · {String(l.id).padStart(3, '0')}
                  </div>
                  <div className="mt-2 text-[14px] font-semibold leading-tight line-clamp-2 text-[color:var(--ink)]">
                    {l.name}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-[2.2rem] font-bold leading-none tabular text-[color:var(--ink)]">
                      {l.daysUntil}
                    </span>
                    <span className="text-[13px] text-[color:var(--ink-mute)]">d</span>
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-dim)] mt-0.5">
                    until {prettyDate(l.event_date!)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* How-to memo */}
        <section className="reveal reveal-3 rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-[14px] font-bold text-[color:var(--ink)] mb-2">How athletes log</h2>
          <p className="text-[14px] text-[color:var(--ink-soft)] leading-relaxed">
            Text the team line. Start the message with{' '}
            <code className="mono bg-[color:var(--paper)] px-1.5 py-0.5 rounded text-[color:var(--green)]">Workout:</code>{' '}
            or{' '}
            <code className="mono bg-[color:var(--paper)] px-1.5 py-0.5 rounded text-[color:var(--amber)]">Rehab:</code>{' '}
            followed by a description.
          </p>
          <div className="mt-4 rounded-lg border-l-2 bg-[color:var(--paper)] p-4 mono text-[12px] text-[color:var(--ink-soft)] leading-relaxed" style={{ borderLeftColor: 'var(--blue)' }}>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--ink-dim)] mb-1.5">Examples</div>
            Workout: erg 5x500 @ 2k pace, 1k warmdown
            <br />
            Rehab: foam roll quads + hip flexors, 20 min
          </div>
        </section>

        {/* Leaderboards */}
        <section className="reveal reveal-4 grid gap-6 md:grid-cols-2">
          <Leaderboard title="This week" rows={weekRows} scoring={team.scoring_json} />
          <Leaderboard title="All time" rows={allTimeRows} scoring={team.scoring_json} />
        </section>

        {/* Past activity table */}
        <section className="reveal reveal-5 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">
              Past activity · {filtered.length} entries
            </h2>
            <Select
              value={kindFilter}
              onValueChange={(v) => setKindFilter(v as typeof kindFilter)}
            >
              <SelectTrigger className="w-[140px] h-9 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="workout">Workouts</SelectItem>
                <SelectItem value="rehab">Rehabs</SelectItem>
              </SelectContent>
            </Select>
          </header>
          {loading ? (
            <p className="px-6 py-8 text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-8 text-[13px] text-[color:var(--ink-mute)]">— no activity logged in this period —</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="w-[240px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                      Athlete
                    </th>
                    <th className="w-[110px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                      When
                    </th>
                    <th className="w-[110px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                      Kind
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                      Description
                    </th>
                    {canDelete && <th className="w-[44px] px-2 py-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const name = l.player?.name ?? 'Unknown';
                    return (
                      <tr
                        key={l.id}
                        className="border-b transition hover:bg-[color:var(--card-hover)]"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="grid size-6 place-items-center rounded-md border bg-[color:var(--paper)] text-[10px] font-bold"
                              style={{ borderColor: 'var(--border)' }}
                            >
                              {l.player ? initials(name) : '?'}
                            </span>
                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold text-[color:var(--ink)] truncate">
                                {name}
                              </div>
                              {l.player?.group && (
                                <div className="text-[11px] uppercase tracking-wide text-[color:var(--ink-dim)] truncate">
                                  {l.player.group}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 mono text-[12px] text-[color:var(--ink-mute)] tabular"
                          title={prettyDate(l.logged_at)}
                        >
                          {relativeTime(l.logged_at)}
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={l.kind === 'workout' ? 'green' : 'amber'}>
                            {prettyCategory(l.kind)}
                          </Pill>
                        </td>
                        <td className="px-4 py-3 text-[14px] leading-snug text-[color:var(--ink-soft)]">
                          {l.description}
                        </td>
                        {canDelete && (
                          <td className="px-2 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => deleteLog(l.id)}
                              disabled={deleting === l.id}
                              title="Hide this entry"
                              aria-label="Hide this entry"
                              className="grid size-7 place-items-center rounded-md border bg-[color:var(--card)] text-[color:var(--ink-mute)] transition hover:bg-[color:var(--red-soft)] hover:text-[color:var(--red)] disabled:opacity-50"
                              style={{ borderColor: 'var(--border)' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              </svg>
                            </button>
                          </td>
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
