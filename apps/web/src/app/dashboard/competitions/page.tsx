'use client';

// /dashboard/competitions — the single home for team standings + activity
// volume (the old /dashboard/fitness "Activity" tab was merged in here).
//
// Layout:
//   1. Volume strip — workouts / rehabs / active loggers / avg (last 30d).
//      Doesn't need a competition; always useful.
//   2. Active now — for each live competition, a compact top-3 preview
//      with a link to the full leaderboard.
//   3. All competitions — the full active/archived list (drill-in).
//   4. Coach: "+ New competition" (full-bleed CTA when none exist).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { StatCell } from '@/components/v3/stat-cell';
import type { Competition } from '@reflect-live/shared';
import { Plus, Trophy } from 'lucide-react';

const MEDALS = ['🥇', '🥈', '🥉'] as const;

interface LeaderRow {
  player_id: number;
  name: string;
  points: number;
}

function isActive(c: Competition, today: string): boolean {
  return !c.archived_at && c.starts_at <= today && today <= c.ends_at;
}

export default function CompetitionsPage() {
  const { team, role, prefs } = useDashboard();
  const sb = useSupabase();
  const canCreate = role === 'coach' || role === 'admin';
  const today = new Date().toISOString().slice(0, 10);

  const [items, setItems] = useState<Competition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [previews, setPreviews] = useState<Record<number, LeaderRow[]>>({});

  // Volume strip — counts over the last 30 days. Cheap browser-client
  // reads (RLS-scoped to this team), same numbers the old Activity tab
  // showed up top.
  const [volume, setVolume] = useState({ workouts: 0, rehabs: 0, activeLoggers: 0, players: 0 });

  useEffect(() => {
    if (!team?.id) return;
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [compRes, logsRes, playersRes] = await Promise.all([
        fetch(`/api/competitions?team_id=${team.id}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { competitions: [] })),
        sb.from('activity_logs').select('player_id, kind').eq('team_id', prefs.team_id).in('kind', ['workout', 'rehab']).eq('hidden', false).gte('logged_at', since),
        sb.from('players').select('id', { count: 'exact', head: true }).eq('team_id', prefs.team_id),
      ]);
      if (!alive) return;

      const comps: Competition[] = compRes.competitions ?? [];
      setItems(comps);
      setLoaded(true);

      const logs = (logsRes.data ?? []) as Array<{ player_id: number; kind: string }>;
      setVolume({
        workouts: logs.filter((l) => l.kind === 'workout').length,
        rehabs: logs.filter((l) => l.kind === 'rehab').length,
        activeLoggers: new Set(logs.map((l) => l.player_id)).size,
        players: playersRes.count ?? 0,
      });

      // Fetch leaderboard previews for the active competitions only.
      const active = comps.filter((c) => isActive(c, today));
      const detail = await Promise.all(
        active.map((c) => fetch(`/api/competitions/${c.id}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))),
      );
      if (!alive) return;
      const map: Record<number, LeaderRow[]> = {};
      active.forEach((c, i) => {
        const lb = detail[i]?.leaderboard ?? [];
        map[c.id] = lb.slice(0, 3).map((row: LeaderRow) => ({ player_id: row.player_id, name: row.name, points: row.points }));
      });
      setPreviews(map);
    })();
    return () => { alive = false; };
  }, [sb, team?.id, prefs.team_id, today]);

  const activeComps = useMemo(() => items.filter((c) => isActive(c, today)), [items, today]);
  const listForTab = items.filter((c) => (tab === 'active' ? !c.archived_at : c.archived_at));

  const avgPerPlayer = volume.players ? Math.round(((volume.workouts + volume.rehabs) / volume.players) * 10) / 10 : 0;

  return (
    <>
      <PageHeader eyebrow="Team" title="Competitions" subtitle={`${team?.name ?? ''} · standings & activity`} />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Volume strip */}
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6"><StatCell label="Workouts" value={volume.workouts} sub="last 30d" tone="green" /></div>
            <div className="p-6"><StatCell label="Rehabs" value={volume.rehabs} sub="last 30d" tone="amber" /></div>
            <div className="p-6"><StatCell label="Active loggers" value={volume.activeLoggers} sub={`of ${volume.players} athletes`} tone="blue" /></div>
            <div className="p-6"><StatCell label="Avg per athlete" value={avgPerPlayer} sub="last 30d" /></div>
          </div>
        </section>

        {/* New button */}
        {canCreate && (
          <div className="reveal reveal-2 flex justify-end">
            <Link
              href="/dashboard/competitions/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ background: 'var(--blue)' }}
            >
              <Plus className="size-4" />
              New competition
            </Link>
          </div>
        )}

        {/* Active competitions — prominent preview cards */}
        {loaded && activeComps.length > 0 && (
          <section className="reveal reveal-2 grid gap-4">
            {activeComps.map((c) => {
              const top = previews[c.id] ?? [];
              const b = new Date(c.ends_at + 'T00:00:00Z').getTime();
              const a = new Date(today + 'T00:00:00Z').getTime();
              const daysLeft = Math.max(0, Math.round((b - a) / 86_400_000) + 1);
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/competitions/${c.id}`}
                  className="rounded-2xl border overflow-hidden transition hover:shadow-[var(--shadow)]"
                  style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                >
                  <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2">
                      <Trophy className="size-4" style={{ color: 'var(--blue)' }} />
                      <h2 className="text-base font-bold text-[color:var(--ink)]">{c.name}</h2>
                      <span className="inline-block size-1.5 rounded-full bg-[color:var(--green)] animate-pulse" aria-label="live" />
                    </div>
                    <span className="text-[11.5px] text-[color:var(--ink-mute)]">{daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>
                  </header>
                  {top.length === 0 ? (
                    <div className="px-6 py-5 text-[13px] text-[color:var(--ink-mute)]">No scored activity yet.</div>
                  ) : (
                    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {top.map((r, i) => (
                        <li key={r.player_id} className="flex items-center justify-between px-6 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <span className="text-[16px] leading-none w-5">{MEDALS[i]}</span>
                            <span className="text-[13.5px] font-semibold text-[color:var(--ink)]">{r.name}</span>
                          </span>
                          <span className="tabular font-bold text-[14px]" style={{ color: 'var(--blue)' }}>{r.points}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="px-6 py-2.5 border-t text-[12px] font-semibold text-[color:var(--blue)]" style={{ borderColor: 'var(--border)' }}>
                    View full leaderboard →
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        {/* All competitions list */}
        <section className="reveal reveal-3 rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">All competitions</h2>
            <nav className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--border)' }}>
              {(['active', 'archived'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="text-[12px] font-semibold px-3 py-1 rounded transition"
                  style={{ background: tab === t ? 'var(--paper-2)' : 'transparent', color: tab === t ? 'var(--ink)' : 'var(--ink-mute)' }}
                >
                  {t === 'active' ? 'Active & upcoming' : 'Archived'}
                </button>
              ))}
            </nav>
          </header>
          {!loaded ? (
            <div className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">loading…</div>
          ) : listForTab.length === 0 ? (
            <div className="px-6 py-12 text-center text-[13px] text-[color:var(--ink-mute)]">
              {tab === 'active'
                ? canCreate
                  ? <>No competitions yet. <Link href="/dashboard/competitions/new" className="text-[color:var(--blue)] hover:underline">Create one</Link>.</>
                  : <>Your coach hasn&apos;t set up a competition yet.</>
                : <>Nothing archived.</>}
            </div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-6 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Name</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Dates</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Status</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Scoring</th>
                </tr>
              </thead>
              <tbody>
                {listForTab.map((c) => {
                  const kinds = Object.entries(c.scoring);
                  const status = c.archived_at
                    ? { label: 'archived', tone: 'var(--ink-dim)' }
                    : isActive(c, today)
                      ? { label: 'live', tone: 'var(--green)' }
                      : c.starts_at > today
                        ? { label: 'upcoming', tone: 'var(--amber)' }
                        : { label: 'ended', tone: 'var(--ink-mute)' };
                  return (
                    <tr key={c.id} className="border-b last:border-b-0 hover:bg-[color:var(--card-hover)] transition" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-6 py-3">
                        <Link href={`/dashboard/competitions/${c.id}`} className="font-semibold text-[color:var(--ink)] hover:text-[color:var(--blue)] transition">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 mono tabular text-[12px] text-[color:var(--ink-soft)]">{c.starts_at} → {c.ends_at}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: status.tone }}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[color:var(--ink-soft)]">
                        {kinds.length === 0 ? <span className="text-[color:var(--ink-dim)]">none set</span> : kinds.map(([k, v]) => `${k}=${v}`).join(' · ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {!canCreate && (
          <p className="reveal reveal-4 text-[11.5px] text-[color:var(--ink-mute)] leading-relaxed">
            Read-only view. Only coaches and platform admins can create or edit competitions.
          </p>
        )}
      </main>
    </>
  );
}
