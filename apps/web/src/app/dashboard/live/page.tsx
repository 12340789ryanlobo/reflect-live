'use client';
import { useEffect, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { ReadinessBar } from '@/components/v3/readiness-bar';
import { LiveFeed } from '@/components/live-feed';
import { ActivityLogTimeline } from '@/components/activity-log-timeline';
import { PeriodToggle } from '@/components/v3/period-toggle';
import { type Period, periodLabel, periodSinceIso } from '@/lib/period';
import { useSupabase } from '@/lib/supabase-browser';

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

export default function LivePage() {
  const { prefs, team } = useDashboard();
  const sb = useSupabase();
  const [days, setDays] = useState<Period>(1);
  const [counts, setCounts] = useState<Counts>({
    messages: 0, activePlayers: 0, rosterSize: 0, responseRate: 0,
    avgReadiness: null, flags: 0, surveyCount: 0,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const since = periodSinceIso(days);
      const groupFilter = prefs.group_filter;
      const pq = sb.from('players').select('id').eq('team_id', prefs.team_id);
      if (groupFilter) pq.eq('group', groupFilter);
      const { data: players } = await pq;
      const rosterSize = players?.length ?? 0;
      const groupPlayerIds = new Set((players ?? []).map((p: { id: number }) => p.id));
      // Page through twilio_messages — Supabase caps each .select() at
      // 1000 rows, so the 'all' period silently truncated the counts.
      type Msg = {
        direction: string; category: string;
        body: string | null; player_id: number | null; date_sent: string;
      };
      const PAGE = 1000;
      const allMsgs: Msg[] = [];
      for (let off = 0; ; off += PAGE) {
        let q = sb
          .from('twilio_messages')
          .select('direction,category,body,player_id,date_sent')
          .eq('team_id', prefs.team_id)
          .eq('hidden', false);
        if (since) q = q.gte('date_sent', since);
        const { data: page } = await q
          .order('date_sent', { ascending: false })
          .range(off, off + PAGE - 1);
        if (!page || page.length === 0) break;
        allMsgs.push(...(page as Msg[]));
        if (page.length < PAGE) break;
      }
      // Scope by player_id (covers inbound + outbound) so the response
      // rate can't exceed 100% by counting whatsapp:/sms: copies of one
      // handset separately — same fix the dashboard already carries.
      const scoped = groupFilter
        ? allMsgs.filter((m) => m.player_id != null && groupPlayerIds.has(m.player_id))
        : allMsgs;
      const activeIds = new Set<number>();
      for (const m of scoped) {
        if (m.direction === 'inbound' && m.player_id != null) activeIds.add(m.player_id);
      }
      const active = activeIds.size;
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

      if (!alive) return;
      setCounts({
        messages: scoped.length, activePlayers: active, rosterSize,
        responseRate: rr, avgReadiness: avg, flags: flagsArr.length, surveyCount: readings.length,
      });
    })();
    return () => { alive = false; };
  }, [sb, prefs.team_id, prefs.group_filter, days]);

  const periodSubtitle = periodLabel(days).toLowerCase();

  return (
    <>
      <PageHeader
        eyebrow="Live monitor"
        title="Live"
        subtitle={`${team.name} · ${periodSubtitle}`}
        live
        actions={<PeriodToggle value={days} onChange={setDays} options={PERIOD_OPTIONS} />}
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
              <div className="p-6"><StatCell label="Messages" value={counts.messages} sub={periodSubtitle} tone="blue" /></div>
              <div className="p-6"><StatCell label="Active" value={`${counts.activePlayers}/${counts.rosterSize}`} sub={`${counts.responseRate}% response rate`} /></div>
              <div className="p-6"><StatCell label="Flags" value={counts.flags} sub="readiness ≤ 4" tone={counts.flags > 0 ? 'red' : 'default'} /></div>
            </div>
          </div>
        </section>

        {/* Wire — full width */}
        <section className="reveal reveal-2"><LiveFeed teamId={prefs.team_id} /></section>

        {/* Activity — full width */}
        <section className="reveal reveal-3"><ActivityLogTimeline teamId={prefs.team_id} /></section>
      </main>
    </>
  );
}
