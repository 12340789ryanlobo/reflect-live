'use client';
import { useEffect, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { ReadinessBar } from '@/components/v3/readiness-bar';
import { LiveFeed } from '@/components/live-feed';
import { WatchlistPanel } from '@/components/watchlist-panel';
import { ActivityLogTimeline } from '@/components/activity-log-timeline';
import { useSupabase } from '@/lib/supabase-browser';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DAY_OPTIONS = [
  { value: '1', label: '24 hours' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
];

interface Counts {
  messages: number;
  activePlayers: number;
  rosterSize: number;
  responseRate: number;
  avgReadiness: number | null;
  flags: number;
  surveyCount: number;
}

export default function Dashboard() {
  const { prefs, team } = useDashboard();
  const sb = useSupabase();
  const [days, setDays] = useState(1);
  const [counts, setCounts] = useState<Counts>({
    messages: 0, activePlayers: 0, rosterSize: 0, responseRate: 0,
    avgReadiness: null, flags: 0, surveyCount: 0,
  });

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const groupFilter = prefs.group_filter;
      const pq = sb.from('players').select('id,phone_e164').eq('team_id', prefs.team_id);
      if (groupFilter) pq.eq('group', groupFilter);
      const { data: players } = await pq;
      const rosterSize = players?.length ?? 0;
      const phoneSet = new Set((players ?? []).map((p: { phone_e164: string }) => p.phone_e164));
      const { data: msgs } = await sb
        .from('twilio_messages')
        .select('from_number,direction,category,body,player_id,date_sent')
        .eq('team_id', prefs.team_id)
        .gte('date_sent', since);
      const allMsgs = (msgs ?? []) as Array<{
        from_number: string | null; direction: string; category: string;
        body: string | null; player_id: number | null; date_sent: string;
      }>;
      const scoped = groupFilter
        ? allMsgs.filter((m) => m.from_number && phoneSet.has(m.from_number))
        : allMsgs;
      const active = new Set(scoped.filter((m) => m.direction === 'inbound').map((m) => m.from_number)).size;
      const rr = rosterSize ? Math.round((active / rosterSize) * 100) : 0;
      const readings = scoped
        .filter((m) => m.category === 'survey' && m.body)
        .map((m) => {
          const match = /^(\d{1,2})/.exec(m.body!.trim());
          return match ? Number(match[1]) : null;
        })
        .filter((n): n is number => n !== null && n >= 1 && n <= 10);
      const avg = readings.length ? Math.round((readings.reduce((a, b) => a + b, 0) / readings.length) * 10) / 10 : null;
      const flagsArr = scoped
        .filter((m) => m.category === 'survey' && m.body)
        .map((m) => {
          const match = /^(\d{1,2})/.exec(m.body!.trim());
          const n = match ? Number(match[1]) : NaN;
          return Number.isFinite(n) && n >= 1 && n <= 4 ? m.date_sent : null;
        })
        .filter((d): d is string => d !== null);

      setCounts({
        messages: scoped.length, activePlayers: active, rosterSize,
        responseRate: rr, avgReadiness: avg, flags: flagsArr.length, surveyCount: readings.length,
      });
    })();
  }, [sb, prefs.team_id, prefs.group_filter, days]);

  const daysShort = DAY_OPTIONS.find((o) => Number(o.value) === days)?.label ?? `${days}d`;

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="Dashboard"
        subtitle={`${team.name} · Last ${daysShort.toLowerCase()}`}
        live
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[160px] h-9 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>Last {o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Hero — readiness bar + 3 stats */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-[minmax(360px,1fr)_2fr]">
          <div className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
            <ReadinessBar
              value={counts.avgReadiness}
              responses={counts.surveyCount}
              flagged={counts.flags}
              size="md"
            />
          </div>
          <div className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
              <div className="p-6"><StatCell label="Messages" value={counts.messages} sub={daysShort.toLowerCase()} tone="blue" /></div>
              <div className="p-6"><StatCell label="Active" value={`${counts.activePlayers}/${counts.rosterSize}`} sub={`${counts.responseRate}% response rate`} /></div>
              <div className="p-6"><StatCell label="Flags" value={counts.flags} sub="readiness ≤ 4" tone={counts.flags > 0 ? 'red' : 'default'} /></div>
            </div>
          </div>
        </section>

        {/* Wire — full width */}
        <section className="reveal reveal-2"><LiveFeed teamId={prefs.team_id} /></section>

        {/* Starred + Activity */}
        <section className="reveal reveal-3 grid gap-6 lg:grid-cols-3">
          <WatchlistPanel teamId={prefs.team_id} watchlist={prefs.watchlist} />
          <div className="lg:col-span-2"><ActivityLogTimeline teamId={prefs.team_id} /></div>
        </section>
      </main>
    </>
  );
}
