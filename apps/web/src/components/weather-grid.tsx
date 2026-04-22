'use client';
import { useEffect, useState } from 'react';
import type { Location, WeatherSnapshot } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const WMO_LABEL: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 95: 'Thunderstorm',
};

export function WeatherGrid({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [locs, setLocs] = useState<Location[]>([]);
  const [latest, setLatest] = useState<Record<number, WeatherSnapshot>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: locsData } = await sb.from('locations').select('*').eq('team_id', teamId).order('kind').order('event_date');
      if (!alive || !locsData) return;
      setLocs(locsData as Location[]);
      const ids = (locsData as Location[]).map((l) => l.id);
      if (ids.length) {
        const { data: snaps } = await sb.from('weather_snapshots').select('*').in('location_id', ids).order('fetched_at', { ascending: false });
        if (snaps) {
          const byLoc: Record<number, WeatherSnapshot> = {};
          for (const s of snaps as WeatherSnapshot[]) if (!byLoc[s.location_id]) byLoc[s.location_id] = s;
          setLatest(byLoc);
        }
      }
    })();
    const ch = sb.channel('weather').on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'weather_snapshots', filter: `team_id=eq.${teamId}` },
      (p) => {
        const s = p.new as WeatherSnapshot;
        setLatest((prev) => ({ ...prev, [s.location_id]: s }));
      }).subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [sb, teamId]);

  if (!locs.length) return <p className="text-sm italic text-muted-foreground">No locations configured.</p>;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {locs.map((l) => {
        const s = latest[l.id];
        return (
          <Card key={l.id} className="p-4 gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium leading-snug">{l.name}</div>
              <Badge variant={l.kind === 'training' ? 'secondary' : 'default'}>{l.kind}</Badge>
            </div>
            {s ? (
              <>
                <div className="h-serif text-3xl font-semibold leading-none">
                  {s.temp_c != null ? `${Math.round(s.temp_c)}°C` : '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.condition_code != null ? (WMO_LABEL[s.condition_code] ?? `code ${s.condition_code}`) : '—'}
                  {s.wind_kph != null && ` · wind ${Math.round(s.wind_kph)} kph`}
                  {s.precip_mm != null && s.precip_mm > 0 && ` · ${s.precip_mm} mm`}
                </div>
                <div className="text-[11px] text-muted-foreground/80">updated {new Date(s.fetched_at).toLocaleTimeString()}</div>
              </>
            ) : (
              <div className="text-xs italic text-muted-foreground">waiting for first snapshot…</div>
            )}
            {l.event_date && <div className="text-xs text-muted-foreground">meet {new Date(l.event_date).toLocaleDateString()}</div>}
          </Card>
        );
      })}
    </div>
  );
}
