'use client';
import { useEffect, useState } from 'react';
import type { Location, WeatherSnapshot } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';

const WMO_LABEL: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 95: 'Thunderstorm',
};

function clockHM(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * WeatherGrid — "VENUE STATIONS"
 *
 * Instrument tiles — one per venue. Kind pill in the header (TRAINING /
 * MEET), big display-serif temperature with a cyan °C unit, mono
 * condition line with wind + precip, and a monospaced "updated HH:MM"
 * telemetry stamp along the bottom edge.
 */
export function WeatherGrid({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [locs, setLocs] = useState<Location[]>([]);
  const [latest, setLatest] = useState<Record<number, WeatherSnapshot>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: locsData } = await sb
        .from('locations')
        .select('*')
        .eq('team_id', teamId)
        .order('kind')
        .order('event_date');
      if (!alive || !locsData) return;
      setLocs(locsData as Location[]);
      const ids = (locsData as Location[]).map((l) => l.id);
      if (ids.length) {
        const { data: snaps } = await sb
          .from('weather_snapshots')
          .select('*')
          .in('location_id', ids)
          .order('fetched_at', { ascending: false });
        if (snaps) {
          const byLoc: Record<number, WeatherSnapshot> = {};
          for (const s of snaps as WeatherSnapshot[]) if (!byLoc[s.location_id]) byLoc[s.location_id] = s;
          setLatest(byLoc);
        }
      }
    })();
    const ch = sb
      .channel('weather')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'weather_snapshots',
          filter: `team_id=eq.${teamId}`,
        },
        (p) => {
          const s = p.new as WeatherSnapshot;
          setLatest((prev) => ({ ...prev, [s.location_id]: s }));
        },
      )
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(ch);
    };
  }, [sb, teamId]);

  if (!locs.length) {
    return (
      <p className="mono text-xs uppercase tracking-widest text-[color:var(--bone-mute)]">
        — no venues configured —
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {locs.map((l) => {
        const s = latest[l.id];
        const kindTone =
          l.kind === 'training'
            ? { color: 'hsl(162 62% 54%)', bg: 'hsl(162 40% 18% / 0.3)', border: 'hsl(162 40% 40%)' }
            : { color: 'hsl(358 78% 58%)', bg: 'hsl(358 40% 22% / 0.3)', border: 'hsl(358 60% 40%)' };

        return (
          <div
            key={l.id}
            className="panel relative overflow-hidden p-4"
            style={{
              borderLeft: `2px solid ${kindTone.color}`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                  STN · {String(l.id).padStart(3, '0')}
                </div>
                <div className="mt-1 text-[0.95rem] font-semibold leading-tight text-[color:var(--bone)]">
                  {l.name}
                </div>
              </div>
              <span
                className="mono px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.22em] rounded-sm shrink-0"
                style={{
                  color: kindTone.color,
                  background: kindTone.bg,
                  border: `1px solid ${kindTone.border}`,
                }}
              >
                {l.kind}
              </span>
            </div>

            {s ? (
              <>
                <div className="mt-3 flex items-baseline gap-1">
                  <div className="num-display text-[2.8rem] leading-none text-[color:var(--bone)]">
                    {s.temp_c != null ? Math.round(s.temp_c) : '—'}
                  </div>
                  <div className="mono text-sm text-[color:var(--signal)] leading-none pb-1">°C</div>
                </div>
                <div className="mt-1 text-xs text-[color:var(--bone-mute)] leading-snug">
                  {s.condition_code != null
                    ? WMO_LABEL[s.condition_code] ?? `code ${s.condition_code}`
                    : '—'}
                  {s.wind_kph != null && (
                    <span className="mono"> · wind {Math.round(s.wind_kph)} kph</span>
                  )}
                  {s.precip_mm != null && s.precip_mm > 0 && (
                    <span className="mono"> · {s.precip_mm} mm</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[0.62rem]">
                    <span className="live-dot" />
                    <span className="mono uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                      UPDATED {clockHM(s.fetched_at)}
                    </span>
                  </span>
                  {l.event_date && (
                    <span className="mono text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                      MEET {new Date(l.event_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-3 mono text-xs uppercase tracking-widest text-[color:var(--bone-mute)]">
                — waiting for first snapshot —
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
