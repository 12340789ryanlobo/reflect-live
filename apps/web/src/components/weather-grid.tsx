'use client';
import { useEffect, useState } from 'react';
import type { Location, WeatherSnapshot } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from './v3/pill';

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
        { event: 'INSERT', schema: 'public', table: 'weather_snapshots', filter: `team_id=eq.${teamId}` },
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
    return <p className="text-[13px] text-[color:var(--ink-mute)]">— no venues configured —</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {locs.map((l) => {
        const s = latest[l.id];
        const tone = l.kind === 'training' ? 'green' : 'blue';
        return (
          <div
            key={l.id}
            className="rounded-xl bg-[color:var(--card)] border p-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[14px] font-semibold text-[color:var(--ink)]">{l.name}</div>
              <Pill tone={tone}>{l.kind}</Pill>
            </div>
            {s ? (
              <>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[34px] font-bold tabular leading-none text-[color:var(--ink)]">
                    {s.temp_c != null ? Math.round(s.temp_c) : '—'}
                  </span>
                  <span className="text-[14px] text-[color:var(--ink-mute)]">°C</span>
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--ink-mute)]">
                  {s.condition_code != null ? WMO_LABEL[s.condition_code] ?? `code ${s.condition_code}` : '—'}
                  {s.wind_kph != null && ` · wind ${Math.round(s.wind_kph)} kph`}
                  {s.precip_mm != null && s.precip_mm > 0 && ` · ${s.precip_mm} mm`}
                </div>
                <div className="mt-3 mono text-[11px] text-[color:var(--ink-mute)] tabular">updated {clockHM(s.fetched_at)}</div>
              </>
            ) : (
              <div className="mt-3 text-[13px] text-[color:var(--ink-mute)]">— waiting for first reading —</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
