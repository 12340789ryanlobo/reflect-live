'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { ReadinessBar } from '@/components/v3/readiness-bar';
import { SurveyTrendsCard } from '@/components/v3/survey-trends-card';
import { buildSurveyTrends, type QuestionTrend } from '@/lib/survey-trends';
import { NeedsAttention } from '@/components/v3/needs-attention';
import { Pill } from '@/components/v3/pill';
import { PeriodToggle } from '@/components/v3/period-toggle';
import { type Period, periodLabel, periodSinceIso } from '@/lib/period';
import { stripProtocolPrefix } from '@/lib/timeline';
import { useSupabase } from '@/lib/supabase-browser';
import type {
  Location, WeatherSnapshot, ActivityLog, TwilioMessage,
} from '@reflect-live/shared';
import { prettyDate, relativeTime } from '@/lib/format';

const PERIOD_OPTIONS: readonly Period[] = [1, 7, 14, 30, 'all'] as const;

interface Counts {
  messages: number;
  activePlayers: number;
  rosterSize: number;
  responseRate: number;
  avgReadiness: number | null;
  flags: number;
  surveyCount: number;
}

interface ActivityWithPlayer extends ActivityLog {
  player: { name: string; group: string | null } | null;
}

export default function Dashboard() {
  const { prefs, team } = useDashboard();
  const sb = useSupabase();
  const [days, setDays] = useState<Period>(7);
  const [counts, setCounts] = useState<Counts>({
    messages: 0, activePlayers: 0, rosterSize: 0, responseRate: 0,
    avgReadiness: null, flags: 0, surveyCount: 0,
  });
  // Twilio messages for the period — fed into buildSurveyTrends below to
  // produce per-metric team trends (the same machinery the athlete page
  // uses, just aggregated across the whole roster).
  const [scopedMsgs, setScopedMsgs] = useState<TwilioMessage[]>([]);
  const [nextMeet, setNextMeet] = useState<(Location & { daysUntil: number; weather?: WeatherSnapshot }) | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityWithPlayer[]>([]);

  // Stats + trend
  useEffect(() => {
    (async () => {
      const since = periodSinceIso(days);
      const groupFilter = prefs.group_filter;
      const pq = sb.from('players').select('id,phone_e164').eq('team_id', prefs.team_id);
      if (groupFilter) pq.eq('group', groupFilter);
      const { data: players } = await pq;
      const rosterSize = players?.length ?? 0;
      const phoneSet = new Set((players ?? []).map((p: { phone_e164: string }) => p.phone_e164));
      const msgQ = sb
        .from('twilio_messages')
        .select('*')
        .eq('team_id', prefs.team_id);
      const { data: msgs } = await (since ? msgQ.gte('date_sent', since) : msgQ);
      const allMsgs = (msgs ?? []) as TwilioMessage[];
      const scoped = groupFilter
        ? allMsgs.filter((m) => m.from_number && phoneSet.has(m.from_number))
        : allMsgs;
      const active = new Set(scoped.filter((m) => m.direction === 'inbound').map((m) => m.from_number)).size;
      const rr = rosterSize ? Math.round((active / rosterSize) * 100) : 0;
      // Hand-off to survey-trends downstream: compute hero stats from
      // the readiness bucket only (not "every numeric reply"), so a
      // Tuesday/Thursday survey day with sleep/focus/RPE numbers
      // doesn't inflate or distort the readiness number.
      setScopedMsgs(scoped);
      setCounts((prev) => ({
        ...prev,
        messages: scoped.length,
        activePlayers: active,
        rosterSize,
        responseRate: rr,
        // avgReadiness / flags / surveyCount are computed in the
        // useMemo below from the trends, after pairing.
      }));
    })();
  }, [sb, prefs.team_id, prefs.group_filter, days]);

  // Per-metric team trends — single source of truth for both the hero
  // readiness number and the small-multiples calendar grid.
  const trends: QuestionTrend[] = useMemo(
    () => buildSurveyTrends(scopedMsgs),
    [scopedMsgs],
  );

  // Hero stats derive from the readiness bucket specifically. If the
  // team's templates don't include a question that maps to readiness
  // (inferMetric returns 'readiness' for "How ready are you", "rate
  // your readiness", etc.), the hero shows '—' instead of a misleading
  // mean over unrelated numerics.
  useEffect(() => {
    const readiness = trends.find((t) => t.key === 'readiness');
    const flagCount = readiness
      ? readiness.points.filter((p) => p.score <= 4).length
      : 0;
    const avg = readiness && readiness.rawCount > 0
      ? Math.round(readiness.rawAvg * 10) / 10
      : null;
    setCounts((prev) => ({
      ...prev,
      avgReadiness: avg,
      flags: flagCount,
      surveyCount: readiness?.rawCount ?? 0,
    }));
  }, [trends]);

  // Next meet + weather
  useEffect(() => {
    (async () => {
      const { data: locs } = await sb.from('locations').select('*').eq('team_id', prefs.team_id);
      const meets = ((locs ?? []) as Location[])
        .filter((l) => l.kind === 'meet' && l.event_date)
        .map((l) => ({ ...l, daysUntil: Math.round((new Date(l.event_date!).getTime() - Date.now()) / 86400000) }))
        .filter((l) => l.daysUntil >= 0)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      const next = meets[0];
      if (!next) { setNextMeet(null); return; }
      const { data: snaps } = await sb.from('weather_snapshots').select('*').eq('location_id', next.id).order('fetched_at', { ascending: false }).limit(1);
      const weather = snaps && snaps.length ? (snaps[0] as WeatherSnapshot) : undefined;
      setNextMeet({ ...next, weather });
    })();
  }, [sb, prefs.team_id]);

  // Recent activity teaser
  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from('activity_logs')
        .select('*, player:players(name, group)')
        .eq('team_id', prefs.team_id)
        .eq('hidden', false)
        .order('logged_at', { ascending: false })
        .limit(4);
      setRecentActivity((data ?? []) as ActivityWithPlayer[]);
    })();
  }, [sb, prefs.team_id]);

  const periodSubtitle = periodLabel(days).toLowerCase();

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="Dashboard"
        subtitle={`${team.name} · ${periodSubtitle}`}
        actions={<PeriodToggle value={days} onChange={setDays} options={PERIOD_OPTIONS} />}
      />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Hero stats strip */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-[minmax(360px,1fr)_2fr]">
          <div className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
            <ReadinessBar value={counts.avgReadiness} responses={counts.surveyCount} flagged={counts.flags} size="md" />
          </div>
          <div className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
              <div className="p-6"><StatCell label="Messages" value={counts.messages} sub={periodSubtitle} tone="blue" /></div>
              <div className="p-6"><StatCell label="Active" value={`${counts.activePlayers}/${counts.rosterSize}`} sub={`${counts.responseRate}% response rate`} /></div>
              <div className="p-6"><StatCell label="Flags" value={counts.flags} sub="readiness ≤ 4" tone={counts.flags > 0 ? 'red' : 'default'} /></div>
            </div>
          </div>
        </section>

        {/* Score trends — per-metric team averages, same machinery as the
            individual athlete page but aggregated across the roster.
            One row per metric (readiness/sleep/focus/RPE/mental/pain/...);
            each cell is a calendar day's mean score across the team.
            Click any cell to drill into that day's questions and replies. */}
        <section className="reveal reveal-2">
          <SurveyTrendsCard trends={trends} period={days} />
        </section>

        {/* Needs attention + Next meet */}
        <section className="reveal reveal-3 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><NeedsAttention teamId={prefs.team_id} /></div>
          <div className="rounded-2xl bg-[color:var(--card)] border p-6 flex flex-col" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[color:var(--ink)]">Next competition</h2>
              <Link href="/dashboard/events" className="text-[12px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition">
                Schedule →
              </Link>
            </header>
            {nextMeet ? (
              <>
                <div className="text-[15px] font-semibold text-[color:var(--ink)]">{nextMeet.name}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <div className="text-[3rem] font-bold leading-none tabular text-[color:var(--ink)]">{nextMeet.daysUntil}</div>
                  <div className="text-[14px] text-[color:var(--ink-mute)]">d</div>
                </div>
                <div className="text-[12px] text-[color:var(--ink-mute)]">until {prettyDate(nextMeet.event_date!)}</div>
                {nextMeet.weather && nextMeet.weather.temp_c != null && (
                  <div className="mt-auto pt-4 text-[12px] text-[color:var(--ink-soft)]">
                    Currently <span style={{ color: 'var(--blue)' }}>{Math.round(nextMeet.weather.temp_c)}°C</span>
                    {nextMeet.weather.wind_kph != null && ` · wind ${Math.round(nextMeet.weather.wind_kph)} kph`}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[13px] text-[color:var(--ink-mute)]">— no upcoming competitions —</p>
            )}
          </div>
        </section>

        {/* Recent activity teaser */}
        <section className="reveal reveal-4 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Recent activity</h2>
            <Link href="/dashboard/fitness" className="text-[12px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition">
              View all →
            </Link>
          </header>
          {recentActivity.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— no recent activity —</p>
          ) : (
            <ul>
              {recentActivity.map((l) => {
                const tone = l.kind === 'workout' ? 'green' : 'amber';
                const inner = (
                  <>
                    <div className="text-[12px] font-semibold text-[color:var(--ink-mute)] tabular min-w-[60px] pt-0.5">
                      {relativeTime(l.logged_at)}
                    </div>
                    <div className="pt-0.5"><Pill tone={tone}>{l.kind}</Pill></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-[color:var(--ink)] group-hover:text-[color:var(--blue)] transition">
                        {l.player?.name ?? 'Unknown'}
                      </div>
                      <div className="text-[13px] text-[color:var(--ink-soft)] leading-relaxed line-clamp-2">{stripProtocolPrefix(l.description)}</div>
                    </div>
                  </>
                );
                return (
                  <li key={l.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    {l.player_id ? (
                      <Link
                        href={`/dashboard/players/${l.player_id}`}
                        className="group flex items-start gap-4 px-6 py-3 hover:bg-[color:var(--paper-2)] transition"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-4 px-6 py-3">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
