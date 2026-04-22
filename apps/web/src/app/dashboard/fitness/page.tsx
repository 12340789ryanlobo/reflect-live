'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Metric } from '@/components/metric-card';
import { useSupabase } from '@/lib/supabase-browser';
import type { ActivityLog, Player, Location } from '@reflect-live/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dumbbell, HeartPulse, Users, Activity, Trophy } from 'lucide-react';
import { prettyCategory, prettyDate, relativeTime } from '@/lib/format';

const DAY_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last year' },
];

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

interface ActivityWithPlayer extends ActivityLog {
  player: { name: string; group: string | null } | null;
}

export default function FitnessPage() {
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [logs, setLogs] = useState<ActivityWithPlayer[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Array<Location & { daysUntil: number }>>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'all' | 'workout' | 'rehab'>('all');

  useEffect(() => {
    (async () => {
      const [{ data: ps }, { data: locs }] = await Promise.all([
        sb.from('players').select('*').eq('team_id', prefs.team_id),
        sb.from('locations').select('*').eq('team_id', prefs.team_id),
      ]);
      setPlayers((ps ?? []) as Player[]);
      const upcoming = ((locs ?? []) as Location[])
        .filter((l) => l.kind === 'meet' && l.event_date)
        .map((l) => ({ ...l, daysUntil: Math.round((new Date(l.event_date!).getTime() - Date.now()) / 86400000) }))
        .filter((l) => l.daysUntil >= 0)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      setLocations(upcoming);
    })();
  }, [sb, prefs.team_id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data } = await sb
        .from('activity_logs')
        .select('*, player:players(name, group)')
        .eq('team_id', prefs.team_id)
        .gte('logged_at', since)
        .order('logged_at', { ascending: false })
        .limit(300);
      setLogs((data ?? []) as ActivityWithPlayer[]);
      setLoading(false);
    })();
  }, [sb, prefs.team_id, days]);

  const workoutCount = logs.filter((l) => l.kind === 'workout').length;
  const rehabCount = logs.filter((l) => l.kind === 'rehab').length;
  const activeLoggers = useMemo(() => new Set(logs.map((l) => l.player_id)).size, [logs]);
  const avgPerPlayer = players.length
    ? Math.round((logs.length / players.length) * 10) / 10
    : 0;

  const filtered = kindFilter === 'all' ? logs : logs.filter((l) => l.kind === kindFilter);
  const daysLabel = DAY_OPTIONS.find((o) => Number(o.value) === days)?.label.toLowerCase() ?? `${days}d`;

  return (
    <>
      <PageHeader
        title="Fitness"
        subtitle={`${logs.length} entries · ${daysLabel}`}
        right={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{DAY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        }
      />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Workouts" value={workoutCount} sub={daysLabel} tone="success" icon={<Dumbbell className="size-4" />} />
          <Metric label="Rehabs" value={rehabCount} sub={daysLabel} tone="warning" icon={<HeartPulse className="size-4" />} />
          <Metric label="Active loggers" value={activeLoggers} sub={`of ${players.length} swimmers`} tone="primary" icon={<Users className="size-4" />} />
          <Metric label="Avg per swimmer" value={avgPerPlayer} sub={daysLabel} icon={<Activity className="size-4" />} />
        </div>

        {locations.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="h-serif text-lg flex items-center gap-2"><Trophy className="size-4 text-primary" />Upcoming competitions</CardTitle>
                  <CardDescription>Weather + countdown to each meet</CardDescription>
                </div>
                <Link href="/dashboard/events" className="text-xs text-primary underline underline-offset-4">All events →</Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                {locations.slice(0, 4).map((l) => (
                  <div key={l.id} className="rounded-lg border p-4">
                    <div className="text-sm font-medium leading-snug line-clamp-2">{l.name}</div>
                    <div className="h-serif text-3xl font-semibold mt-2 tabular">{l.daysUntil}d</div>
                    <div className="text-xs text-muted-foreground">until {prettyDate(l.event_date!)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-muted/40 border-dashed">
          <CardContent className="text-sm space-y-2">
            <p><strong>How swimmers log:</strong> text the team WhatsApp number. Start with <strong>&quot;Workout:&quot;</strong> or <strong>&quot;Rehab:&quot;</strong> followed by a description.</p>
            <div className="rounded-md border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
              <span className="text-muted-foreground/70">Examples:</span><br />
              Workout: erg 5x500 @ 2k pace, 1k warmdown<br />
              Rehab: foam roll quads + hip flexors, 20 min
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="h-serif text-lg">Past activity</CardTitle>
                <CardDescription>{filtered.length} entries · {daysLabel}</CardDescription>
              </div>
              <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds</SelectItem>
                  <SelectItem value="workout">Workouts</SelectItem>
                  <SelectItem value="rehab">Rehabs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <p className="px-6 text-sm italic text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-6 text-sm italic text-muted-foreground">No activity logged in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[240px]">Swimmer</TableHead>
                    <TableHead className="w-[110px]">When</TableHead>
                    <TableHead className="w-[110px]">Kind</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => {
                    const name = l.player?.name ?? 'Unknown';
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-6 shrink-0">
                              <AvatarFallback className="text-[9px] font-medium">{l.player ? initials(name) : '?'}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{name}</div>
                              {l.player?.group && <div className="text-[11px] text-muted-foreground truncate">{l.player.group}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular" title={prettyDate(l.logged_at)}>{relativeTime(l.logged_at)}</TableCell>
                        <TableCell><Badge variant={l.kind === 'workout' ? 'default' : 'secondary'}>{prettyCategory(l.kind)}</Badge></TableCell>
                        <TableCell className="text-sm leading-snug">{l.description}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
