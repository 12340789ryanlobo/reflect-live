'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { ReadinessDial } from '@/components/readiness-dial';
import { LiveFeed } from '@/components/live-feed';
import { WatchlistPanel } from '@/components/watchlist-panel';
import { ActivityLogTimeline } from '@/components/activity-log-timeline';
import { NewsFeed } from '@/components/news-feed';
import { useSupabase } from '@/lib/supabase-browser';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { bucketize } from '@/components/sparkline';

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
    messages: 0,
    activePlayers: 0,
    rosterSize: 0,
    responseRate: 0,
    avgReadiness: null,
    flags: 0,
    surveyCount: 0,
  });
  const [messageSpark, setMessageSpark] = useState<number[]>([]);
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
      const { data: msgs } = await sb
        .from('twilio_messages')
        .select('from_number,direction,category,body,player_id,date_sent')
        .eq('team_id', prefs.team_id)
        .gte('date_sent', since);
      const allMsgs =
        (msgs ?? []) as Array<{
          from_number: string | null;
          direction: string;
          category: string;
          body: string | null;
          player_id: number | null;
          date_sent: string;
        }>;
      const scoped = groupFilter
        ? allMsgs.filter((m) => m.from_number && phoneSet.has(m.from_number))
        : allMsgs;
      const active = new Set(
        scoped.filter((m) => m.direction === 'inbound').map((m) => m.from_number),
      ).size;
      const rr = rosterSize ? Math.round((active / rosterSize) * 100) : 0;
      const readings = scoped
        .filter((m) => m.category === 'survey' && m.body)
        .map((m) => {
          const match = /^(\d{1,2})/.exec(m.body!.trim());
          return match ? Number(match[1]) : null;
        })
        .filter((n): n is number => n !== null && n >= 1 && n <= 10);
      const avg = readings.length
        ? Math.round((readings.reduce((a, b) => a + b, 0) / readings.length) * 10) / 10
        : null;
      const flagsArr = scoped
        .filter((m) => m.category === 'survey' && m.body)
        .map((m) => {
          const match = /^(\d{1,2})/.exec(m.body!.trim());
          const n = match ? Number(match[1]) : NaN;
          return Number.isFinite(n) && n >= 1 && n <= 4 ? m.date_sent : null;
        })
        .filter((d): d is string => d !== null);

      setCounts({
        messages: scoped.length,
        activePlayers: active,
        rosterSize,
        responseRate: rr,
        avgReadiness: avg,
        flags: flagsArr.length,
        surveyCount: readings.length,
      });

      const winMs = days * 24 * 3600 * 1000;
      const bucketCount = days === 1 ? 24 : days === 7 ? 28 : 30;
      setMessageSpark(bucketize(scoped.map((m) => m.date_sent), bucketCount, winMs));
      setFlagSpark(bucketize(flagsArr, bucketCount, winMs));
    })();
  }, [sb, prefs.team_id, prefs.group_filter, days]);

  const daysShort = DAY_OPTIONS.find((o) => Number(o.value) === days)?.label ?? `${days}d`;
  const scopedSubtitle = prefs.group_filter
    ? `${team.name} · ${prefs.group_filter.toUpperCase()}`
    : team.name.toUpperCase();

  return (
    <>
      <PageHeader
        eyebrow="Control room"
        title="Control"
        italic="room."
        subtitle={scopedSubtitle}
        live
        right={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[140px] h-9 mono text-xs uppercase tracking-wider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  Last {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* HERO — dial on the left, three key readouts on the right. No wrapper labels. */}
        <section className="reveal reveal-1 panel grid gap-0 md:grid-cols-[minmax(320px,auto)_1fr]">
          <div className="flex flex-col items-center justify-center border-b border-[color:var(--hairline)] p-6 md:border-b-0 md:border-r">
            <ReadinessDial
              value={counts.avgReadiness}
              responses={counts.surveyCount}
              flagged={counts.flags}
              size={260}
              label="Team readiness"
              sublabel={
                counts.surveyCount > 0
                  ? `${counts.surveyCount} RESPONSES · ${daysShort.toUpperCase()}`
                  : 'NO SURVEYS YET'
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
            <div className="p-6 border-b border-[color:var(--hairline)] sm:border-b-0 sm:border-r">
              <StatReadout
                label="Messages"
                value={counts.messages}
                sub={daysShort.toUpperCase()}
                tone="signal"
                spark={messageSpark}
                accent={false}
              />
            </div>
            <div className="p-6 border-b border-[color:var(--hairline)] sm:border-b-0 sm:border-r">
              <StatReadout
                label="Active"
                value={`${counts.activePlayers}/${counts.rosterSize}`}
                sub={`REPLIED · ${daysShort.toUpperCase()}`}
                tone="heritage"
                accent={false}
              />
            </div>
            <div className="p-6">
              <StatReadout
                label="Flags"
                value={counts.flags}
                sub="READINESS ≤ 4"
                tone={counts.flags > 0 ? 'siren' : 'default'}
                spark={flagSpark}
                accent={false}
              />
            </div>
          </div>
        </section>

        {/* WIRE — full-width focal point. */}
        <section className="reveal reveal-2">
          <LiveFeed teamId={prefs.team_id} />
        </section>

        {/* SECONDARY — starred + news side-by-side. */}
        <section className="reveal reveal-3 grid gap-6 lg:grid-cols-3">
          <WatchlistPanel teamId={prefs.team_id} watchlist={prefs.watchlist} />
          <div className="lg:col-span-2">
            <NewsFeed />
          </div>
        </section>

        {/* THE LOG — bottom. */}
        <section className="reveal reveal-4">
          <ActivityLogTimeline teamId={prefs.team_id} />
        </section>

        {/* Thin footer — calendar link */}
        <section className="reveal reveal-5 border-t border-[color:var(--hairline)] pt-6">
          <Link
            href="/dashboard/events"
            className="inline-flex items-center gap-2 mono text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--bone-soft)] hover:text-[color:var(--signal)] transition"
          >
            Venue calendar →
          </Link>
        </section>
      </main>
    </>
  );
}
