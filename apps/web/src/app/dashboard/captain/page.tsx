'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { ReadinessDial } from '@/components/readiness-dial';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
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
        subtitle={`${team.name.toUpperCase()} · CAPTAIN`}
        live
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* Top strip with dial */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-12">
          <div className="panel flex flex-col items-center justify-center gap-4 p-6 lg:col-span-4">
            <SectionTag name="Team readiness · 7d" className="w-full" />
            <ReadinessDial
              value={agg.avgReadiness}
              responses={agg.surveyCount}
              flagged={agg.flags}
              size={260}
              label="Readiness"
              sublabel={agg.surveyCount > 0 ? `${agg.surveyCount} RESPONSES · 7D` : 'NO SURVEYS YET'}
            />
          </div>
          <div className="panel lg:col-span-8">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag name="Check-in telemetry" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 md:grid-cols-4">
              <StatReadout
                label="Checked in today"
                value={`${agg.checkedIn}/${agg.activeCount}`}
                sub="ACTIVE ROSTER"
                spark={spark}
                tone="chlorine"
              />
              <StatReadout
                label="Still pending"
                value={agg.pending}
                sub="NO REPLY TODAY"
                tone={agg.pending > 0 ? 'amber' : 'default'}
              />
              <StatReadout
                label="Response rate"
                value={`${agg.responseRate}%`}
                sub="LAST 7D"
                tone={agg.responseRate >= 70 ? 'chlorine' : 'amber'}
              />
              <StatReadout
                label="Flags"
                value={agg.flags}
                sub="READINESS ≤ 4"
                tone={agg.flags > 0 ? 'siren' : 'default'}
              />
            </div>
          </div>
        </section>

        {/* Follow-ups */}
        <section className="reveal reveal-2 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag
              name="Who to follow up with"
              right={
                overdue.length > 0 && (
                  <Link
                    href="/dashboard/captain/follow-ups"
                    className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--signal)] hover:text-[color:var(--bone)] transition"
                  >
                    FULL LIST →
                  </Link>
                )
              }
            />
          </div>
          {overdue.length === 0 ? (
            <p className="px-6 py-10 text-center mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — everyone checked in. Nice. —
            </p>
          ) : (
            <ul className="grid gap-0 md:grid-cols-2">
              {overdue.slice(0, 10).map(({ p, ts }, i) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 border-b border-[color:var(--hairline)]/60 px-5 py-3 ${
                    i % 2 === 0 ? 'md:border-r md:border-[color:var(--hairline)]/60' : ''
                  }`}
                >
                  <span className="grid size-8 place-items-center rounded-sm border border-[color:var(--hairline)] bg-[color:var(--panel-raised)] text-[0.66rem] font-semibold shrink-0">
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[color:var(--bone)]">
                      {p.name}
                    </div>
                    <div className="mono truncate text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                      {p.group ?? 'no group'} · {ts ? `last reply ${relativeTime(ts)}` : 'never'}
                    </div>
                  </div>
                  <Stamp tone={ts ? 'watch' : 'quiet'}>{ts ? 'watch' : 'silent'}</Stamp>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Weather */}
        <section className="reveal reveal-3 panel p-5">
          <SectionTag
            name="Venue stations"
            live
            right={
              <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                POLL EVERY 10M
              </span>
            }
          />
          <div className="mb-5" />
          <WeatherGrid teamId={prefs.team_id} />
        </section>

        {/* Next meets */}
        {meets.length > 0 && (
          <section className="reveal reveal-4 panel">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag name="Next meets" />
            </div>
            <div className="grid gap-0 md:grid-cols-3">
              {meets.map((m, i) => (
                <div
                  key={m.id}
                  className={`p-5 ${i < meets.length - 1 ? 'border-r border-[color:var(--hairline)]' : ''}`}
                >
                  <div className="text-sm font-semibold text-[color:var(--bone)]">{m.name}</div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="num-display text-[2.2rem] leading-none tabular">
                      {m.daysUntil}
                    </span>
                    <span className="mono text-xs text-[color:var(--bone-mute)]">d</span>
                  </div>
                  <div className="mono text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                    UNTIL {prettyDate(m.event_date!).toUpperCase()}
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
