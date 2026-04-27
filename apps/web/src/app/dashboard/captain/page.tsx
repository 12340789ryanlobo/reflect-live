'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { Pill } from '@/components/v3/pill';
import { ReadinessBar } from '@/components/v3/readiness-bar';
import { WeatherGrid } from '@/components/weather-grid';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, Location } from '@reflect-live/shared';
import { bucketize } from '@/components/sparkline';
import { relativeTime, prettyDate } from '@/lib/format';

function initials(n: string) {
  return n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function CaptainHome() {
  const { prefs, team } = useDashboard();
  const sb = useSupabase();
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastInbound, setLastInbound] = useState<Map<number, string>>(new Map());
  const [spark, setSpark] = useState<number[]>([]);
  const [agg, setAgg] = useState({
    checkedIn: 0,
    pending: 0,
    responseRate: 0,
    avgReadiness: null as number | null,
    flags: 0,
    activeCount: 0,
    surveyCount: 0,
  });
  const [meets, setMeets] = useState<Array<Location & { daysUntil: number }>>([]);

  useEffect(() => {
    (async () => {
      const [{ data: ps }, { data: msgs }, { data: locs }] = await Promise.all([
        sb.from('players').select('*').eq('team_id', prefs.team_id).eq('active', true),
        sb
          .from('twilio_messages')
          .select('player_id,direction,category,body,date_sent')
          .eq('team_id', prefs.team_id)
          .gte('date_sent', new Date(Date.now() - 7 * 86400000).toISOString()),
        sb.from('locations').select('*').eq('team_id', prefs.team_id),
      ]);
      const playerList = (ps ?? []) as Player[];
      setPlayers(playerList);
      const m =
        (msgs ?? []) as Array<{
          player_id: number | null;
          direction: string;
          category: string;
          body: string | null;
          date_sent: string;
        }>;

      const last = new Map<number, string>();
      for (const row of m) {
        if (row.direction !== 'inbound' || row.player_id == null) continue;
        const prev = last.get(row.player_id);
        if (!prev || row.date_sent > prev) last.set(row.player_id, row.date_sent);
      }
      setLastInbound(last);

      const dayAgo = Date.now() - 86400000;
      const checkedIn = [...last.entries()].filter(([, ts]) => new Date(ts).getTime() >= dayAgo).length;
      const activeCount = playerList.length;
      const pending = Math.max(0, activeCount - checkedIn);
      const responseRate7d = activeCount ? Math.round((last.size / activeCount) * 100) : 0;

      const readings: number[] = [];
      for (const row of m) {
        if (row.category !== 'survey' || !row.body) continue;
        const mm = /^(\d{1,2})/.exec(row.body.trim());
        if (!mm) continue;
        const n = Number(mm[1]);
        if (n >= 1 && n <= 10) readings.push(n);
      }
      const avg = readings.length
        ? Math.round((readings.reduce((a, b) => a + b, 0) / readings.length) * 10) / 10
        : null;
      const flags = readings.filter((n) => n <= 4).length;

      setAgg({ checkedIn, pending, responseRate: responseRate7d, avgReadiness: avg, flags, activeCount, surveyCount: readings.length });

      setSpark(
        bucketize(m.filter((r) => r.direction === 'inbound').map((r) => r.date_sent), 24, 86400000),
      );

      const upcoming = (locs ?? [])
        .filter((l: Location) => l.kind === 'meet' && l.event_date)
        .map((l: Location) => ({
          ...l,
          daysUntil: Math.round((new Date(l.event_date!).getTime() - Date.now()) / 86400000),
        }))
        .filter((l) => l.daysUntil >= 0)
        .sort((a, b) => a.daysUntil - b.daysUntil)
        .slice(0, 3);
      setMeets(upcoming as Array<Location & { daysUntil: number }>);
    })();
  }, [sb, prefs.team_id]);

  const overdue = players
    .map((p) => ({ p, ts: lastInbound.get(p.id) ?? null }))
    .filter(({ ts }) => !ts || Date.now() - new Date(ts).getTime() > 86400000)
    .sort((a, b) => {
      const ta = a.ts ? new Date(a.ts).getTime() : 0;
      const tb = b.ts ? new Date(b.ts).getTime() : 0;
      return ta - tb;
    });

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="Dashboard"
        subtitle={`${team.name} · Captain`}
        live
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Hero row */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-12">
          {/* Stats card */}
          <div className="rounded-2xl bg-[color:var(--card)] border lg:col-span-8" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Check-in telemetry</h2>
            </header>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
              <div className="p-6">
                <StatCell
                  label="Checked in today"
                  value={`${agg.checkedIn}/${agg.activeCount}`}
                  sub="active roster"
                  tone="green"
                />
              </div>
              <div className="p-6">
                <StatCell
                  label="Still pending"
                  value={agg.pending}
                  sub="no reply today"
                  tone={agg.pending > 0 ? 'amber' : 'default'}
                />
              </div>
              <div className="p-6">
                <StatCell
                  label="Response rate"
                  value={`${agg.responseRate}%`}
                  sub="last 7d"
                  tone={agg.responseRate >= 70 ? 'green' : 'amber'}
                />
              </div>
              <div className="p-6">
                <StatCell
                  label="Flags"
                  value={agg.flags}
                  sub="readiness ≤ 4"
                  tone={agg.flags > 0 ? 'red' : 'default'}
                />
              </div>
            </div>
          </div>

          {/* Readiness card */}
          <div className="rounded-2xl bg-[color:var(--card)] border p-6 lg:col-span-4 flex flex-col justify-center" style={{ borderColor: 'var(--border)' }}>
            <ReadinessBar
              value={agg.avgReadiness}
              responses={agg.surveyCount}
              flagged={agg.flags}
              size="md"
            />
          </div>
        </section>

        {/* Who to follow up with */}
        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Who to follow up with</h2>
            {overdue.length > 0 && (
              <Link
                href="/dashboard/captain/follow-ups"
                className="text-[13px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition"
              >
                Full list →
              </Link>
            )}
          </header>
          {overdue.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
              — everyone checked in. Nice. —
            </p>
          ) : (
            <ul className="grid gap-0 md:grid-cols-2">
              {overdue.slice(0, 10).map(({ p, ts }, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 border-b px-5 py-3"
                  style={{ borderColor: 'var(--border)', ...(i % 2 === 0 ? {} : {}) }}
                >
                  <span className="grid size-8 place-items-center rounded-md border bg-[color:var(--paper)] text-[11px] font-bold shrink-0" style={{ borderColor: 'var(--border)' }}>
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[color:var(--ink)]">
                      {p.name}
                    </div>
                    <div className="text-[12px] text-[color:var(--ink-dim)] truncate">
                      {p.group ?? 'no group'} · {ts ? `last reply ${relativeTime(ts)}` : 'never'}
                    </div>
                  </div>
                  <Pill tone={ts ? 'amber' : 'mute'}>{ts ? 'watch' : 'silent'}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Venue stations */}
        <section className="reveal reveal-3 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Venue stations</h2>
            <span className="text-[12px] text-[color:var(--ink-mute)]">Poll every 10m</span>
          </header>
          <div className="p-5">
            <WeatherGrid teamId={prefs.team_id} />
          </div>
        </section>

        {/* Next meets */}
        {meets.length > 0 && (
          <section className="reveal reveal-4 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Next meets</h2>
            </header>
            <div className="grid gap-0 md:grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
              {meets.map((m) => (
                <div key={m.id} className="p-5">
                  <div className="text-[14px] font-semibold text-[color:var(--ink)]">{m.name}</div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-[2.2rem] font-bold leading-none tabular text-[color:var(--ink)]">
                      {m.daysUntil}
                    </span>
                    <span className="text-[13px] text-[color:var(--ink-mute)]">d</span>
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-dim)] mt-0.5">
                    until {prettyDate(m.event_date!)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
