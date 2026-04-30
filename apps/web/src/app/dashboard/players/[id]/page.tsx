'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, useDashboard } from '@/components/dashboard-shell';
import { AthleteHero, type ActionVerb } from '@/components/v3/athlete-hero';
import { HeatmapTabs, type InjurySideRow } from '@/components/v3/heatmap-tabs';
import { UnifiedTimeline } from '@/components/v3/unified-timeline';
import { type Period, periodSinceIso } from '@/lib/period';
import { parseInjuryRegions } from '@/lib/injury-aliases';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, TwilioMessage, ActivityLog } from '@reflect-live/shared';

interface InjuryRow {
  id: number;
  regions: string[];
  severity: number | null;
  description: string;
  reported_at: string;
  resolved_at: string | null;
}

function countRegions(rows: ActivityLog[], kind: 'workout' | 'rehab'): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r.kind !== kind) continue;
    for (const region of parseInjuryRegions(r.description)) {
      if (region === 'other') continue;
      counts[region] = (counts[region] ?? 0) + 1;
    }
  }
  return counts;
}

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const playerId = Number(id);
  const sb = useSupabase();
  const router = useRouter();
  const { team, prefs } = useDashboard();
  const [player, setPlayer] = useState<Player | null>(null);
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [injuries, setInjuries] = useState<InjuryRow[]>([]);
  const [period, setPeriod] = useState<Period>(30);

  useEffect(() => {
    let alive = true;
    (async () => {
      const since = periodSinceIso(period);

      const msgQ = sb
        .from('twilio_messages')
        .select('*')
        .eq('player_id', playerId)
        .order('date_sent', { ascending: false })
        .limit(200);
      const logQ = sb
        .from('activity_logs')
        .select('*')
        .eq('player_id', playerId)
        .order('logged_at', { ascending: false })
        .limit(200);
      const injQ = sb
        .from('injury_reports')
        .select('id,regions,severity,description,reported_at,resolved_at')
        .eq('player_id', playerId)
        .order('reported_at', { ascending: false })
        .limit(200);

      const [{ data: p }, { data: m }, { data: l }, { data: inj }] = await Promise.all([
        sb.from('players').select('*').eq('id', playerId).single(),
        since ? msgQ.gte('date_sent', since) : msgQ,
        since ? logQ.gte('logged_at', since) : logQ,
        since ? injQ.gte('reported_at', since) : injQ,
      ]);
      if (!alive) return;
      setPlayer(p as Player);
      setMsgs((m ?? []) as TwilioMessage[]);
      setLogs((l ?? []) as ActivityLog[]);
      setInjuries((inj ?? []) as InjuryRow[]);
    })();
    return () => { alive = false; };
  }, [sb, playerId, period]);

  const injuryCounts = useMemo<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    for (const r of injuries) {
      if (r.resolved_at) continue;
      for (const region of r.regions) c[region] = (c[region] ?? 0) + 1;
    }
    return c;
  }, [injuries]);

  const activityCounts = useMemo(() => countRegions(logs, 'workout'), [logs]);
  const rehabCounts = useMemo(() => countRegions(logs, 'rehab'), [logs]);

  const injurySideRows = useMemo<InjurySideRow[]>(
    () =>
      injuries
        .filter((r) => !r.resolved_at)
        .map((r) => ({
          id: r.id,
          regions: r.regions,
          severity: r.severity,
          description: r.description,
          reportedAt: r.reported_at,
        })),
    [injuries],
  );

  const derived = useMemo(() => {
    const surveyReadings = msgs
      .filter((m) => m.category === 'survey' && m.body)
      .map((m) => {
        const match = /^(\d{1,2})/.exec(m.body!.trim());
        return match ? Number(match[1]) : null;
      })
      .filter((n): n is number => n !== null && n >= 1 && n <= 10);
    const avgReadiness = surveyReadings.length
      ? Math.round((surveyReadings.reduce((a, b) => a + b, 0) / surveyReadings.length) * 10) / 10
      : null;
    const lastInbound = msgs.find((m) => m.direction === 'inbound')?.date_sent ?? null;
    const flags = surveyReadings.filter((n) => n <= 4).length;
    return { avgReadiness, responses: surveyReadings.length, flags, lastInbound };
  }, [msgs]);

  if (!player) {
    return (
      <>
        <PageHeader eyebrow="Athlete" title="Loading…" />
        <main className="flex flex-1 p-6">
          <p className="text-[13px] text-[color:var(--ink-mute)]">— loading athlete —</p>
        </main>
      </>
    );
  }

  // Athletes get self-affordances when viewing themselves; coaches/captains/admins always get coach-affordances.
  const viewerIsSelf =
    prefs.role === 'athlete' &&
    !prefs.is_platform_admin &&
    prefs.impersonate_player_id === player.id;
  // Phone is always visible: when viewer is the athlete it's their own
  // number; when viewer is a coach/captain/admin they have legit access.
  const showPhone = true;

  function onAction(verb: ActionVerb) {
    switch (verb) {
      case 'text':
        if (player) window.location.href = `sms:${player.phone_e164}`;
        return;
      case 'mark_injury_resolved':
        router.push('/dashboard/heatmap');
        return;
      case 'self_report':
      case 'log_workout':
      case 'report_injury':
        // TODO route — implementation lands in D3 follow-up.
        // log_workout is shared by both viewers (coach logs on behalf of
        // athlete; athlete logs for self) and will land with the
        // "notes for coach" field as part of that work.
        alert(`Coming soon: ${verb.replace('_', ' ')}`);
        return;
    }
  }

  return (
    <>
      <PageHeader eyebrow="Athlete" title={player.name} />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        <AthleteHero
          player={player}
          derived={derived}
          period={period}
          onPeriodChange={setPeriod}
          viewerIsSelf={viewerIsSelf}
          showPhone={showPhone}
          onAction={onAction}
        />
        <HeatmapTabs
          injuryCounts={injuryCounts}
          activityCounts={activityCounts}
          rehabCounts={rehabCounts}
          injuryRows={injurySideRows}
          gender={(player.gender ?? team.default_gender ?? 'male')}
        />
        <UnifiedTimeline logs={logs} messages={msgs} period={period} />
      </main>
    </>
  );
}
