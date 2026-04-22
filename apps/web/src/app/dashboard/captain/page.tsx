'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Metric } from '@/components/metric-card';
import { WeatherGrid } from '@/components/weather-grid';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, Location } from '@reflect-live/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { bucketize } from '@/components/sparkline';
import { relativeTime, prettyDate } from '@/lib/format';
import { Users, TrendingUp, Heart, Flag, AlertCircle } from 'lucide-react';

function initials(n: string) { return n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase(); }

export default function CaptainHome() {
  const { prefs, team } = useDashboard();
  const sb = useSupabase();
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastInbound, setLastInbound] = useState<Map<number, string>>(new Map());
  const [spark, setSpark] = useState<number[]>([]);
  const [agg, setAgg] = useState({ checkedIn: 0, pending: 0, responseRate: 0, avgReadiness: null as number | null, flags: 0, activeCount: 0 });
  const [meets, setMeets] = useState<Array<Location & { daysUntil: number }>>([]);

  useEffect(() => {
    (async () => {
      const [{ data: ps }, { data: msgs }, { data: locs }] = await Promise.all([
        sb.from('players').select('*').eq('team_id', prefs.team_id).eq('active', true),
        sb.from('twilio_messages').select('player_id,direction,category,body,date_sent').eq('team_id', prefs.team_id).gte('date_sent', new Date(Date.now() - 7 * 86400000).toISOString()),
        sb.from('locations').select('*').eq('team_id', prefs.team_id),
      ]);
      const playerList = (ps ?? []) as Player[];
      setPlayers(playerList);
      const m = (msgs ?? []) as Array<{ player_id: number | null; direction: string; category: string; body: string | null; date_sent: string }>;

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
      const avg = readings.length ? Math.round((readings.reduce((a, b) => a + b, 0) / readings.length) * 10) / 10 : null;
      const flags = readings.filter((n) => n <= 4).length;

      setAgg({ checkedIn, pending, responseRate: responseRate7d, avgReadiness: avg, flags, activeCount });

      setSpark(bucketize(m.filter((r) => r.direction === 'inbound').map((r) => r.date_sent), 24, 86400000));

      const upcoming = (locs ?? [])
        .filter((l: Location) => l.kind === 'meet' && l.event_date)
        .map((l: Location) => ({ ...l, daysUntil: Math.round((new Date(l.event_date!).getTime() - Date.now()) / 86400000) }))
        .filter((l) => l.daysUntil >= 0)
        .sort((a, b) => a.daysUntil - b.daysUntil)
        .slice(0, 3);
      setMeets(upcoming as Array<Location & { daysUntil: number }>);
    })();
  }, [sb, prefs.team_id]);

  const overdue = players
    .map((p) => ({ p, ts: lastInbound.get(p.id) ?? null }))
    .filter(({ ts }) => !ts || (Date.now() - new Date(ts).getTime()) > 86400000)
    .sort((a, b) => {
      const ta = a.ts ? new Date(a.ts).getTime() : 0;
      const tb = b.ts ? new Date(b.ts).getTime() : 0;
      return ta - tb;
    });

  return (
    <>
      <PageHeader title="Team pulse" subtitle={team.name} right={<Badge variant="secondary">Captain view</Badge>} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Metric label="Checked in today" value={`${agg.checkedIn}/${agg.activeCount}`} sub="active players" spark={spark} tone="success" icon={<Users className="size-4" />} />
          <Metric label="Still pending" value={agg.pending} sub="haven't replied today" tone={agg.pending > 0 ? 'warning' : 'default'} icon={<AlertCircle className="size-4" />} />
          <Metric label="Response rate" value={`${agg.responseRate}%`} sub="last 7 days" tone={agg.responseRate >= 70 ? 'success' : 'warning'} icon={<TrendingUp className="size-4" />} />
          <Metric label="Avg readiness" value={agg.avgReadiness ?? '—'} sub={agg.avgReadiness !== null ? 'team average · last 7d' : 'no surveys'} icon={<Heart className="size-4" />} />
          <Metric label="Flags" value={agg.flags} sub="low readiness reports · 7d" tone={agg.flags > 0 ? 'danger' : 'default'} icon={<Flag className="size-4" />} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="h-serif text-lg">Who to follow up with</CardTitle>
                <CardDescription>
                  {overdue.length} active {overdue.length === 1 ? "player hasn't" : "players haven't"} replied in the last 24 hours
                </CardDescription>
              </div>
              {overdue.length > 0 && <Link href="/dashboard/captain/follow-ups" className="text-xs text-primary underline underline-offset-4">Full list →</Link>}
            </div>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">Everyone checked in recently. Nice.</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {overdue.slice(0, 10).map(({ p, ts }) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="text-[10px] font-medium">{initials(p.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.group ?? 'No group'} · {ts ? `last reply ${relativeTime(ts)}` : 'no messages yet'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg">Weather at your venues</CardTitle>
            <CardDescription>Training pool + upcoming meets</CardDescription>
          </CardHeader>
          <CardContent>
            <WeatherGrid teamId={prefs.team_id} />
          </CardContent>
        </Card>

        {meets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">Next meets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {meets.map((m) => (
                  <div key={m.id} className="rounded-lg border p-4">
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="h-serif text-3xl font-semibold mt-1 tabular">{m.daysUntil}d</div>
                    <div className="text-xs text-muted-foreground">until {prettyDate(m.event_date!)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
