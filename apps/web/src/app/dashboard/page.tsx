'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Metric } from '@/components/metric-card';
import { LiveFeed } from '@/components/live-feed';
import { WatchlistPanel } from '@/components/watchlist-panel';
import { ActivityLogTimeline } from '@/components/activity-log-timeline';
import { WorkerHealthCard } from '@/components/worker-health-card';
import { WeatherGrid } from '@/components/weather-grid';
import { useSupabase } from '@/lib/supabase-browser';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { bucketize } from '@/components/sparkline';
import { MessageSquareText, Users, TrendingUp, Heart, Flag } from 'lucide-react';

const DAY_OPTIONS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

interface Counts { messages: number; activePlayers: number; rosterSize: number; responseRate: number; avgReadiness: number | null; flags: number; }

export default function Dashboard() {
  const { prefs, team } = useDashboard();
  const sb = useSupabase();
  const [days, setDays] = useState(1);
  const [counts, setCounts] = useState<Counts>({ messages: 0, activePlayers: 0, rosterSize: 0, responseRate: 0, avgReadiness: null, flags: 0 });
  const [messageSpark, setMessageSpark] = useState<number[]>([]);
  const [workoutSpark, setWorkoutSpark] = useState<number[]>([]);
  const [flagSpark, setFlagSpark] = useState<number[]>([]);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const groupFilter = prefs.group_filter;
      const pq = sb.from('players').select('id,phone_e164').eq('team_id', prefs.team_id);
      if (groupFilter) pq.eq('group', groupFilter);
      const { data: players } = await pq;
      const rosterSize = players?.length ?? 0;
      const phoneSet = new Set((players ?? []).map((p: { phone_e164: string }) => p.phone_e164));
      const { data: msgs } = await sb.from('twilio_messages').select('from_number,direction,category,body,player_id,date_sent').eq('team_id', prefs.team_id).gte('date_sent', since);
      const allMsgs = (msgs ?? []) as Array<{ from_number: string | null; direction: string; category: string; body: string | null; player_id: number | null; date_sent: string }>;
      const scoped = groupFilter ? allMsgs.filter((m) => m.from_number && phoneSet.has(m.from_number)) : allMsgs;
      const active = new Set(scoped.filter((m) => m.direction === 'inbound').map((m) => m.from_number)).size;
      const rr = rosterSize ? Math.round((active / rosterSize) * 100) : 0;
      const readings = scoped.filter((m) => m.category === 'survey' && m.body).map((m) => { const match = /^(\d{1,2})/.exec(m.body!.trim()); return match ? Number(match[1]) : null; }).filter((n): n is number => n !== null && n >= 1 && n <= 10);
      const avg = readings.length ? Math.round((readings.reduce((a, b) => a + b, 0) / readings.length) * 10) / 10 : null;
      const flagsArr = scoped
        .filter((m) => m.category === 'survey' && m.body)
        .map((m) => {
          const match = /^(\d{1,2})/.exec(m.body!.trim());
          const n = match ? Number(match[1]) : NaN;
          return Number.isFinite(n) && n >= 1 && n <= 4 ? m.date_sent : null;
        })
        .filter((d): d is string => d !== null);

      setCounts({ messages: scoped.length, activePlayers: active, rosterSize, responseRate: rr, avgReadiness: avg, flags: flagsArr.length });

      const winMs = days * 24 * 3600 * 1000;
      const bucketCount = days === 1 ? 24 : days === 7 ? 28 : 30;
      setMessageSpark(bucketize(scoped.map((m) => m.date_sent), bucketCount, winMs));
      setWorkoutSpark(bucketize(scoped.filter((m) => m.category === 'workout').map((m) => m.date_sent), bucketCount, winMs));
      setFlagSpark(bucketize(flagsArr, bucketCount, winMs));
    })();
  }, [sb, prefs.team_id, prefs.group_filter, days]);

  const daysLabel = DAY_OPTIONS.find((o) => Number(o.value) === days)?.label.toLowerCase() ?? `last ${days} days`;
  const scopedTitle = prefs.group_filter ? `${team.name} · ${prefs.group_filter}` : `${team.name} Dashboard`;

  return (
    <>
      <PageHeader
        title={scopedTitle}
        subtitle={prefs.group_filter ? <Badge variant="secondary">Viewing {prefs.group_filter}</Badge> : null}
        right={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{DAY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        }
      />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Messages" value={counts.messages} sub={daysLabel} spark={messageSpark} icon={<MessageSquareText className="size-4" />} />
          <Metric label="Active players" value={`${counts.activePlayers}/${counts.rosterSize}`} sub={`replied ${daysLabel}`} tone="primary" icon={<Users className="size-4" />} />
          <Metric label="Response rate" value={`${counts.responseRate}%`} sub={daysLabel} tone={counts.responseRate < 50 ? 'warning' : 'success'} icon={<TrendingUp className="size-4" />} />
          <Metric label="Avg readiness" value={counts.avgReadiness ?? '—'} sub={counts.avgReadiness !== null ? 'out of 10' : 'no surveys'} icon={<Heart className="size-4" />} />
          <Metric label="Flags" value={counts.flags} sub="readiness ≤ 4" tone={counts.flags > 0 ? 'danger' : 'default'} spark={flagSpark} icon={<Flag className="size-4" />} />
          <WorkerHealthCard />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="h-serif text-lg">Weather</CardTitle>
                <CardDescription>Training + upcoming meets · polls every 10 min</CardDescription>
              </div>
              <Link href="/dashboard/events" className="text-xs text-primary underline underline-offset-4">View all events →</Link>
            </div>
          </CardHeader>
          <CardContent>
            <WeatherGrid teamId={prefs.team_id} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><LiveFeed teamId={prefs.team_id} /></div>
          <WatchlistPanel teamId={prefs.team_id} watchlist={prefs.watchlist} />
        </div>

        <ActivityLogTimeline teamId={prefs.team_id} />
      </main>
    </>
  );
}
