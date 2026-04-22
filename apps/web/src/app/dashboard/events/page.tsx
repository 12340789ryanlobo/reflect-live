'use client';
import { useEffect, useMemo, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { SectionTag } from '@/components/section-tag';
import { WeatherGrid } from '@/components/weather-grid';
import { useSupabase } from '@/lib/supabase-browser';
import type { Location, WeatherSnapshot } from '@reflect-live/shared';
import { prettyDate, relativeTime } from '@/lib/format';

export default function EventsPage() {
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [locs, setLocs] = useState<Location[]>([]);
  const [latest, setLatest] = useState<Record<number, WeatherSnapshot>>({});

  useEffect(() => {
    (async () => {
      const { data: ls } = await sb
        .from('locations')
        .select('*')
        .eq('team_id', prefs.team_id)
        .order('event_date');
      setLocs((ls ?? []) as Location[]);
      const ids = (ls ?? []).map((l: Location) => l.id);
      if (ids.length) {
        const { data: snaps } = await sb
          .from('weather_snapshots')
          .select('*')
          .in('location_id', ids)
          .order('fetched_at', { ascending: false });
        const byLoc: Record<number, WeatherSnapshot> = {};
        for (const s of (snaps ?? []) as WeatherSnapshot[]) {
          if (!byLoc[s.location_id]) byLoc[s.location_id] = s;
        }
        setLatest(byLoc);
      }
    })();
  }, [sb, prefs.team_id]);

  const meetsWithDates = useMemo(
    () =>
      locs
        .filter((l) => l.kind === 'meet' && l.event_date)
        .map((l) => ({
          ...l,
          daysUntil: Math.round(
            (new Date(l.event_date!).getTime() - Date.now()) / (24 * 3600 * 1000),
          ),
        }))
        .sort((a, b) => a.daysUntil - b.daysUntil),
    [locs],
  );

  const future = meetsWithDates.filter((e) => e.daysUntil >= 0);
  const past = meetsWithDates.filter((e) => e.daysUntil < 0);
  const training = locs.filter((l) => l.kind === 'training');

  return (
    <>
      <PageHeader
        eyebrow="The calendar"
        title="The"
        italic="calendar."
        subtitle={`${future.length} UPCOMING · ${training.length} TRAINING · ${past.length} PAST`}
        live
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* Telemetry strip */}
        <section className="reveal reveal-1 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag name="Calendar telemetry" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 md:grid-cols-4">
            <StatReadout label="Upcoming" value={future.length} sub="MEETS" tone="heritage" />
            <StatReadout
              label="Next meet"
              value={future[0] ? `${future[0].daysUntil}d` : '—'}
              sub={future[0]?.name.toUpperCase() ?? 'NONE SCHEDULED'}
              tone="signal"
            />
            <StatReadout label="Training" value={training.length} sub="LIVE WEATHER" tone="chlorine" />
            <StatReadout label="Archived" value={past.length} sub="PAST MEETS" />
          </div>
        </section>

        {/* Venue stations — weather grid */}
        <section className="reveal reveal-2 panel p-5">
          <SectionTag
            name="Venue stations"
            live
            right={
              <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                POLL EVERY 10M
              </span>
            }
          />
          <div className="mt-5">
            <WeatherGrid teamId={prefs.team_id} />
          </div>
        </section>

        {/* Upcoming meets — editorial tiles with countdown */}
        <section className="reveal reveal-3 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag name="Upcoming meets" />
          </div>
          {future.length === 0 ? (
            <p className="px-6 py-10 text-center mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — no upcoming meets scheduled —
            </p>
          ) : (
            <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-3">
              {future.map((e, i) => {
                const s = latest[e.id];
                const isNext = i === 0;
                return (
                  <div
                    key={e.id}
                    className="relative border-b border-r border-[color:var(--hairline)] p-5 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+3)]:border-b-0 xl:[&:nth-child(3n)]:border-r-0 md:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r"
                  >
                    {isNext && (
                      <div
                        aria-hidden
                        className="absolute left-0 top-0 h-[2px] w-full"
                        style={{ background: 'var(--heritage)' }}
                      />
                    )}
                    <div className="flex items-start justify-between">
                      <div className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                        EVT · {String(e.id).padStart(3, '0')}
                      </div>
                      {isNext && (
                        <span className="mono text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--heritage)]">
                          NEXT UP
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[color:var(--bone)] leading-tight">
                      {e.name}
                    </div>
                    <div className="mt-4 flex items-baseline gap-1.5">
                      <div className="num-display text-[3rem] leading-none tabular">
                        {e.daysUntil}
                      </div>
                      <div className="mono text-sm text-[color:var(--bone-mute)] leading-none">d</div>
                    </div>
                    <div className="mono text-[0.68rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                      UNTIL {prettyDate(e.event_date!).toUpperCase()}
                    </div>
                    {s && (
                      <div className="mt-4 border-t border-dashed border-[color:var(--hairline)] pt-3 mono text-[0.7rem] text-[color:var(--bone-soft)] tabular">
                        <span style={{ color: 'hsl(188 82% 58%)' }}>
                          {s.temp_c != null ? `${Math.round(s.temp_c)}°C` : '—'}
                        </span>
                        {s.wind_kph != null && ` · ${Math.round(s.wind_kph)}kph wind`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Past meets */}
        {past.length > 0 && (
          <section className="reveal reveal-4 panel">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag name="Archived" />
            </div>
            <ul className="divide-y divide-[color:var(--hairline)]/60">
              {past.map((e) => (
                <li key={e.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="mono text-[0.68rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)] w-20">
                    {prettyDate(e.event_date!)}
                  </div>
                  <div className="flex-1 text-sm font-semibold text-[color:var(--bone-soft)]">
                    {e.name}
                  </div>
                  <div className="mono text-[0.7rem] text-[color:var(--bone-mute)] tabular">
                    {Math.abs(e.daysUntil)}d ago
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Training sites */}
        {training.length > 0 && (
          <section className="reveal reveal-5 panel">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag name="Training sites" />
            </div>
            <ul className="divide-y divide-[color:var(--hairline)]/60">
              {training.map((t) => {
                const s = latest[t.id];
                return (
                  <li key={t.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="grid size-8 place-items-center rounded-sm border border-[color:var(--hairline)] bg-[color:var(--panel-raised)] mono text-[0.62rem]">
                      ST
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-[color:var(--bone)]">{t.name}</div>
                      <div className="mono text-[0.66rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                        {s
                          ? `${s.temp_c != null ? `${Math.round(s.temp_c)}°C` : '—'} · updated ${relativeTime(s.fetched_at)}`
                          : '— no weather yet —'}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
