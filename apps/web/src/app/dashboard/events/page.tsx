'use client';
import { useEffect, useMemo, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Metric } from '@/components/metric-card';
import { useSupabase } from '@/lib/supabase-browser';
import type { Location, WeatherSnapshot } from '@reflect-live/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, CalendarClock, MapPin, Archive } from 'lucide-react';
import { prettyDate, relativeTime } from '@/lib/format';

export default function EventsPage() {
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [locs, setLocs] = useState<Location[]>([]);
  const [latest, setLatest] = useState<Record<number, WeatherSnapshot>>({});

  useEffect(() => {
    (async () => {
      const { data: ls } = await sb.from('locations').select('*').eq('team_id', prefs.team_id).order('event_date');
      setLocs((ls ?? []) as Location[]);
      const ids = (ls ?? []).map((l: Location) => l.id);
      if (ids.length) {
        const { data: snaps } = await sb.from('weather_snapshots').select('*').in('location_id', ids).order('fetched_at', { ascending: false });
        const byLoc: Record<number, WeatherSnapshot> = {};
        for (const s of (snaps ?? []) as WeatherSnapshot[]) {
          if (!byLoc[s.location_id]) byLoc[s.location_id] = s;
        }
        setLatest(byLoc);
      }
    })();
  }, [sb, prefs.team_id]);

  const meetsWithDates = useMemo(() =>
    locs
      .filter((l) => l.kind === 'meet' && l.event_date)
      .map((l) => ({ ...l, daysUntil: Math.round((new Date(l.event_date!).getTime() - Date.now()) / (24 * 3600 * 1000)) }))
      .sort((a, b) => a.daysUntil - b.daysUntil)
  , [locs]);

  const future = meetsWithDates.filter((e) => e.daysUntil >= 0);
  const past = meetsWithDates.filter((e) => e.daysUntil < 0);
  const training = locs.filter((l) => l.kind === 'training');

  return (
    <>
      <PageHeader title="Events" subtitle="Meets & training sites" />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Upcoming meets" value={future.length} sub="on the calendar" icon={<Calendar className="size-4" />} />
          <Metric label="Next meet" value={future[0] ? `${future[0].daysUntil}d` : '—'} sub={future[0]?.name ?? 'nothing scheduled'} tone="primary" icon={<CalendarClock className="size-4" />} />
          <Metric label="Training sites" value={training.length} sub="weather tracked" tone="success" icon={<MapPin className="size-4" />} />
          <Metric label="Past meets" value={past.length} sub="archived" icon={<Archive className="size-4" />} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg">Upcoming meets</CardTitle>
            <CardDescription>Countdown + current on-site weather</CardDescription>
          </CardHeader>
          <CardContent>
            {future.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No upcoming meets scheduled.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {future.map((e) => {
                  const s = latest[e.id];
                  return (
                    <Card key={e.id} className="p-4 gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium leading-snug">{e.name}</div>
                        <Badge variant="default">meet</Badge>
                      </div>
                      <div className="h-serif text-3xl font-semibold leading-none">{e.daysUntil}d</div>
                      <div className="text-xs text-muted-foreground">until {prettyDate(e.event_date!)}</div>
                      {s && (
                        <div className="text-xs text-muted-foreground/80">
                          currently {s.temp_c != null ? `${Math.round(s.temp_c)}°C` : '—'}
                          {s.wind_kph != null && ` · wind ${Math.round(s.wind_kph)} kph`}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {past.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">Past meets</CardTitle>
              <CardDescription>{past.length} archived</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Meet</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Days ago</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {past.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="text-muted-foreground">{prettyDate(e.event_date!)}</TableCell>
                      <TableCell>{Math.abs(e.daysUntil)}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {training.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">Training sites</CardTitle>
              <CardDescription>{training.length} weather-tracked</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {training.map((t) => {
                  const s = latest[t.id];
                  return (
                    <li key={t.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s ? `${s.temp_c != null ? `${Math.round(s.temp_c)}°C` : '—'} · updated ${relativeTime(s.fetched_at)}` : 'no weather yet'}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
