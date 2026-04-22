'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { ReadinessDial } from '@/components/readiness-dial';
import { LiveFeed } from '@/components/live-feed';
import { WatchlistPanel } from '@/components/watchlist-panel';
import { ActivityLogTimeline } from '@/components/activity-log-timeline';
import { WorkerHealthCard } from '@/components/worker-health-card';
import { NewsFeed } from '@/components/news-feed';
import { SectionTag } from '@/components/section-tag';
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
      setWorkoutSpark(
        bucketize(
          scoped.filter((m) => m.category === 'workout').map((m) => m.date_sent),
          bucketCount,
          winMs,
        ),
      );
      setFlagSpark(bucketize(flagsArr, bucketCount, winMs));
    })();
  }, [sb, prefs.team_id, prefs.group_filter, days]);

  const daysShort = DAY_OPTIONS.find((o) => Number(o.value) === days)?.label ?? `${days}d`;
  const scopedSubtitle = prefs.group_filter
    ? `${team.name} · ${prefs.group_filter} · WINDOW ${daysShort}`
    : `${team.name} · WINDOW ${daysShort}`;

  return (
    <>
      <PageHeader
        code="00."
        eyebrow="Control Room"
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
        {/* ======== TOP STRIP — Dial + Stats ======== */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-12">
          {/* Dial — the signature element */}
          <div className="panel flex flex-col items-center justify-center gap-4 p-6 lg:col-span-4">
            <SectionTag code="HERO" name="Team readiness" className="w-full" />
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
            <div className="grid w-full grid-cols-3 gap-2 border-t border-[color:var(--hairline)] pt-3">
              <MiniStat
                label="Healthy"
                value={counts.surveyCount - counts.flags}
                tone="chlorine"
              />
              <MiniStat label="Flagged" value={counts.flags} tone="siren" />
              <MiniStat
                label="Rate"
                value={`${counts.responseRate}%`}
                tone={counts.responseRate >= 70 ? 'chlorine' : 'amber'}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="panel lg:col-span-8">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag code="TELEMETRY" name="Broadcast telemetry" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 md:grid-cols-3 xl:grid-cols-5">
              <StatReadout
                label="Messages"
                value={counts.messages}
                sub={daysShort.toUpperCase()}
                tone="signal"
                spark={messageSpark}
              />
              <StatReadout
                label="Active roster"
                value={`${counts.activePlayers}/${counts.rosterSize}`}
                sub={`REPLIED · ${daysShort.toUpperCase()}`}
                tone="heritage"
              />
              <StatReadout
                label="Workouts"
                value={workoutSpark.reduce((a, b) => a + b, 0)}
                sub={daysShort.toUpperCase()}
                tone="chlorine"
                spark={workoutSpark}
              />
              <StatReadout
                label="Flags"
                value={counts.flags}
                sub="READINESS ≤ 4"
                tone={counts.flags > 0 ? 'siren' : 'default'}
                spark={flagSpark}
              />
              <WorkerHealthCard />
            </div>
          </div>
        </section>

        {/* ======== THE WIRE + STARRED ======== */}
        <section className="reveal reveal-2 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LiveFeed teamId={prefs.team_id} />
          </div>
          <WatchlistPanel teamId={prefs.team_id} watchlist={prefs.watchlist} />
        </section>

        {/* ======== BROADCAST + CALENDAR ======== */}
        <section className="reveal reveal-3 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <NewsFeed />
          </div>
          <div className="panel p-5">
            <SectionTag
              code="03."
              name="The calendar"
              right={
                <Link
                  href="/dashboard/events"
                  className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--signal)] hover:text-[color:var(--bone)] transition"
                >
                  ALL EVENTS →
                </Link>
              }
            />
            <p className="mt-2 text-xs text-[color:var(--bone-mute)]">
              Meets, venues, and their live conditions. Full tile grid lives on the events page.
            </p>
            <div className="mt-6 space-y-3">
              <CalendarRow label="Next meet" value="—" />
              <CalendarRow label="Training sites tracked" value="—" />
              <CalendarRow label="Forecast cadence" value="10 MIN" signal />
            </div>
            <Link
              href="/dashboard/events"
              className="mt-6 inline-flex items-center gap-2 border border-[color:var(--hairline-strong)] px-4 py-2 mono text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--bone-soft)] hover:border-[color:var(--heritage)] hover:text-[color:var(--heritage)] transition"
            >
              Open calendar →
            </Link>
          </div>
        </section>

        {/* ======== THE LOG ======== */}
        <section className="reveal reveal-4">
          <ActivityLogTimeline teamId={prefs.team_id} />
        </section>
      </main>
    </>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: 'chlorine' | 'amber' | 'siren';
}) {
  const color = {
    chlorine: 'hsl(162 62% 54%)',
    amber: 'hsl(38 90% 62%)',
    siren: 'hsl(356 82% 62%)',
  }[tone];
  return (
    <div className="flex flex-col items-center text-center">
      <span className="mono text-[0.6rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
        {label}
      </span>
      <span
        className="num-display text-lg leading-none mt-1 tabular"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

function CalendarRow({
  label,
  value,
  signal,
}: {
  label: string;
  value: React.ReactNode;
  signal?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[color:var(--hairline)] pb-2 last:border-0 last:pb-0">
      <span className="mono text-[0.66rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
        {label}
      </span>
      <span
        className="mono text-sm font-semibold tabular"
        style={{ color: signal ? 'hsl(188 82% 58%)' : 'var(--bone)' }}
      >
        {value}
      </span>
    </div>
  );
}
