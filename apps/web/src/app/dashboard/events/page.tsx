'use client';
import { useEffect, useMemo, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
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
        eyebrow="Events & venues"
        title="Schedule"
        subtitle={`${future.length} upcoming · ${training.length} training · ${past.length} past`}
        live
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Top stats row */}
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6">
              <StatCell label="Upcoming" value={future.length} sub="competitions" tone="blue" />
            </div>
            <div className="p-6">
              <StatCell
                label="Next competition"
                value={future[0] ? `${future[0].daysUntil}d` : '—'}
                sub={future[0]?.name ?? 'none scheduled'}
                tone="blue"
              />
            </div>
            <div className="p-6">
              <StatCell label="Training" value={training.length} sub="live weather" tone="green" />
            </div>
            <div className="p-6">
              <StatCell label="Archived" value={past.length} sub="past competitions" />
            </div>
          </div>
        </section>

        {/* Venue stations */}
        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Venue stations</h2>
            <span className="text-[12px] text-[color:var(--ink-mute)]">Poll every 10m</span>
          </header>
          <div className="p-5">
            <WeatherGrid teamId={prefs.team_id} />
          </div>
        </section>

        {/* Upcoming competitions */}
        <section className="reveal reveal-3 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Upcoming competitions</h2>
          </header>
          {future.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
              — no upcoming competitions scheduled —
            </p>
          ) : (
            <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-3">
              {future.map((e, i) => {
                const s = latest[e.id];
                const isNext = i === 0;
                return (
                  <div
                    key={e.id}
                    className="relative border-b border-r p-5 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+3)]:border-b-0 xl:[&:nth-child(3n)]:border-r-0 md:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {isNext && (
                      <div
                        aria-hidden
                        className="absolute left-0 top-0 h-[2px] w-full"
                        style={{ background: 'var(--blue)' }}
                      />
                    )}
                    <div className="flex items-start justify-between">
                      <div className="mono text-[11px] font-semibold uppercase tracking-widest text-[color:var(--ink-mute)]">
                        EVT · {String(e.id).padStart(3, '0')}
                      </div>
                      {isNext && (
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--blue)]">
                          Next up
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-[14px] font-semibold leading-tight text-[color:var(--ink)]">
                      {e.name}
                    </div>
                    <div className="mt-4 flex items-baseline gap-1.5">
                      <div className="text-[3rem] font-bold leading-none tabular text-[color:var(--ink)]">
                        {e.daysUntil}
                      </div>
                      <div className="text-[13px] text-[color:var(--ink-mute)] leading-none">d</div>
                    </div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-dim)] mt-0.5">
                      until {prettyDate(e.event_date!)}
                    </div>
                    {s && (
                      <div className="mt-4 border-t border-dashed pt-3 mono text-[12px] text-[color:var(--ink-soft)] tabular" style={{ borderColor: 'var(--border)' }}>
                        <span style={{ color: 'var(--blue)' }}>
                          {s.temp_c != null ? `${Math.round(s.temp_c)}°C` : '—'}
                        </span>
                        {s.wind_kph != null && ` · wind ${Math.round(s.wind_kph)} kph`}
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
          <section className="reveal reveal-4 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Archived</h2>
            </header>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {past.map((e) => (
                <li key={e.id} className="flex items-center gap-4 px-6 py-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="mono text-[12px] text-[color:var(--ink-mute)] tabular w-24 shrink-0">
                    {prettyDate(e.event_date!)}
                  </div>
                  <div className="flex-1 text-[14px] font-semibold text-[color:var(--ink-soft)]">
                    {e.name}
                  </div>
                  <div className="mono text-[12px] text-[color:var(--ink-dim)] tabular">
                    {Math.abs(e.daysUntil)}d ago
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Training sites */}
        {training.length > 0 && (
          <section className="reveal reveal-5 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Training sites</h2>
            </header>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {training.map((t) => {
                const s = latest[t.id];
                return (
                  <li key={t.id} className="flex items-center gap-4 px-6 py-3" style={{ borderColor: 'var(--border)' }}>
                    <span className="grid size-8 place-items-center rounded-md border bg-[color:var(--paper)] mono text-[11px] font-bold shrink-0" style={{ borderColor: 'var(--border)' }}>
                      ST
                    </span>
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold text-[color:var(--ink)]">{t.name}</div>
                      <div className="mono text-[11px] text-[color:var(--ink-dim)]">
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
