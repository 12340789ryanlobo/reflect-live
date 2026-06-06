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
  Location, ActivityLog, TwilioMessage,
} from '@reflect-live/shared';
import { prettyCalendarDate, daysUntilCalendarDate, humanizeDaysUntil, relativeTime } from '@/lib/format';
import { Star } from 'lucide-react';

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
  // Upcoming events, pinned-first then soonest. Drives the single
  // "Upcoming" box (replaces the separate next-meet widget + key strip).
  const [upcoming, setUpcoming] = useState<Array<Location & { daysUntil: number }>>([]);
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
      // For group-filtered scoping we use player_id (covers both
      // outbound-to-player and inbound-from-player). The old phone-set
      // filter excluded all outbound — that broke survey-trend pairing
      // because the question text lives on outbound messages.
      const groupPlayerIds = new Set(
        (players ?? []).map((p: { id: number }) => p.id),
      );
      // Page through twilio_messages — Supabase caps each .select() at
      // 1000 rows, so an "all-time" fetch was silently truncated and
      // both the message count and the trends grid lost most of the
      // history. Range-paginate until exhausted.
      const PAGE = 1000;
      const allMsgs: TwilioMessage[] = [];
      for (let off = 0; ; off += PAGE) {
        let q = sb
          .from('twilio_messages')
          .select('*')
          .eq('team_id', prefs.team_id)
          .eq('hidden', false);
        if (since) q = q.gte('date_sent', since);
        const { data: page } = await q
          .order('date_sent', { ascending: false })
          .range(off, off + PAGE - 1);
        if (!page || page.length === 0) break;
        allMsgs.push(...(page as TwilioMessage[]));
        if (page.length < PAGE) break;
      }
      // Soft-deleted sessions should drop out of every surface, not
      // just /dashboard/sessions. Pull the (player_id × time-window)
      // pairs for deliveries whose parent session is deleted, then
      // filter messages whose timestamp falls inside one of those
      // windows. ±5min padding covers the question burst at the start
      // and the trailing ack.
      const { data: delDelivs } = await sb
        .from('deliveries')
        .select('player_id,started_at,completed_at,session:sessions!inner(deleted_at)')
        .not('session.deleted_at', 'is', null)
        .in('player_id', Array.from(new Set((allMsgs.map((m) => m.player_id).filter((x): x is number => x != null)))));
      const PAD = 5 * 60_000;
      const FALLBACK = 48 * 3600_000;
      const windowsByPlayer = new Map<number, Array<[number, number]>>();
      for (const d of (delDelivs ?? []) as Array<{ player_id: number; started_at: string; completed_at: string | null }>) {
        const start = Date.parse(d.started_at);
        const end = d.completed_at ? Date.parse(d.completed_at) : start + FALLBACK;
        const arr = windowsByPlayer.get(d.player_id) ?? [];
        arr.push([start - PAD, end + PAD]);
        windowsByPlayer.set(d.player_id, arr);
      }
      const inDeletedWindow = (m: TwilioMessage): boolean => {
        if (m.player_id == null) return false;
        const wins = windowsByPlayer.get(m.player_id);
        if (!wins) return false;
        const t = Date.parse(m.date_sent);
        for (const [a, b] of wins) if (t >= a && t <= b) return true;
        return false;
      };
      const visibleMsgs = allMsgs.filter((m) => !inDeletedWindow(m));
      const scoped = groupFilter
        ? visibleMsgs.filter((m) => m.player_id != null && groupPlayerIds.has(m.player_id))
        : visibleMsgs;
      // "Active" = roster players who responded at least once. Counting
      // by player_id (not raw from_number) collapses whatsapp:+E164 vs
      // +E164 duplicates and bounds the response rate at 100% — the old
      // phone-string set produced a 171% rate by counting whatsapp/sms
      // copies of the same handset separately.
      const activeIds = new Set<number>();
      for (const m of scoped) {
        if (m.direction !== 'inbound') continue;
        if (m.player_id != null) activeIds.add(m.player_id);
      }
      const active = activeIds.size;
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
      const up = ((locs ?? []) as Location[])
        .filter((l) => l.kind === 'meet' && l.event_date)
        // Calendar-safe day count (no UTC off-by-one).
        .map((l) => ({ ...l, daysUntil: daysUntilCalendarDate(l.event_date!) }))
        .filter((l) => l.daysUntil >= 0)
        // Pinned events lead, then soonest-first within each group.
        .sort((a, b) =>
          a.is_pinned !== b.is_pinned ? (a.is_pinned ? -1 : 1) : a.daysUntil - b.daysUntil,
        );
      setUpcoming(up);
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

  // Split upcoming into the two labeled groups the Upcoming box shows.
  const pinnedEvents = upcoming.filter((e) => e.is_pinned);
  const regularEvents = upcoming.filter((e) => !e.is_pinned);

  // One row renderer for both groups. `isKey` adds the star + a faint
  // amber wash so key events read as a distinct block.
  function upcomingRow(e: Location & { daysUntil: number }, isKey: boolean) {
    return (
      <li key={e.id} style={{ borderColor: 'var(--border)' }}>
        <Link
          href="/dashboard/events"
          className="flex items-center justify-between gap-4 px-6 py-3.5 transition hover:bg-[color:var(--card-hover)]"
          style={isKey ? { background: 'color-mix(in srgb, var(--amber-soft) 55%, transparent)' } : undefined}
        >
          <div className="min-w-0">
            {/* No per-row star — the 'KEY EVENTS' label + amber wash
                already mark these as key, so a star here is redundant. */}
            <div className="min-w-0">
              <span className="text-[14.5px] font-semibold text-[color:var(--ink)] truncate">{e.name}</span>
            </div>
            <div className="text-[11.5px] text-[color:var(--ink-mute)] truncate mt-0.5">
              {[e.place_label, prettyCalendarDate(e.event_date!)].filter(Boolean).join(' · ')}
            </div>
          </div>
          <span className="text-[12.5px] font-semibold shrink-0" style={{ color: e.daysUntil <= 7 ? 'var(--blue)' : 'var(--ink-mute)' }}>
            {humanizeDaysUntil(e.daysUntil)}
          </span>
        </Link>
      </li>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="Dashboard"
        subtitle={`${team.name} · ${periodSubtitle}`}
        actions={<PeriodToggle value={days} onChange={setDays} options={PERIOD_OPTIONS} />}
      />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Upcoming — one box for all upcoming events. Name leads,
            countdown is a quiet supporting chip (humanized: "in 9
            months", not "260 d"). Pinned 'key' events sort to the top
            with a gold star + gold left accent. Replaces both the old
            next-competition widget and the separate key-events strip.
            Hidden when there are no upcoming events. */}
        {upcoming.length > 0 && (
          <section className="reveal reveal-1 rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Upcoming</h2>
              <Link href="/dashboard/events" className="text-[12px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition">
                Events →
              </Link>
            </header>

            {/* Key events — labeled, amber-washed group at the top. */}
            {pinnedEvents.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-6 pt-3 pb-1.5">
                  <Star className="size-3" style={{ color: 'var(--amber)' }} fill="var(--amber)" />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--amber)' }}>Key events</span>
                </div>
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {pinnedEvents.map((e) => upcomingRow(e, true))}
                </ul>
              </>
            )}

            {/* Everything else. The label only appears when there's a
                key group above it to distinguish from. */}
            {regularEvents.length > 0 && (
              <div className={pinnedEvents.length > 0 ? 'border-t' : ''} style={{ borderColor: 'var(--border)' }}>
                {pinnedEvents.length > 0 && (
                  <div className="px-6 pt-3 pb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--ink-mute)]">More upcoming</span>
                  </div>
                )}
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {regularEvents.slice(0, 5).map((e) => upcomingRow(e, false))}
                </ul>
              </div>
            )}
          </section>
        )}

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

        {/* Needs attention — full width now that upcoming events live
            in their own box at the top. */}
        <section className="reveal reveal-3">
          <NeedsAttention teamId={prefs.team_id} />
        </section>

        {/* Recent activity teaser */}
        <section className="reveal reveal-4 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Recent activity</h2>
            <Link href="/dashboard/competitions" className="text-[12px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition">
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
