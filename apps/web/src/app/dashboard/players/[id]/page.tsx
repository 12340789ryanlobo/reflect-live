'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, useDashboard } from '@/components/dashboard-shell';
import { AthleteHero, type ActionVerb } from '@/components/v3/athlete-hero';
import { HeatmapTabs, type InjurySideRow } from '@/components/v3/heatmap-tabs';
import { UnifiedTimeline } from '@/components/v3/unified-timeline';
import { type Period, periodSinceIso } from '@/lib/period';
import { parseAllRegions } from '@/lib/injury-aliases';
import { regionToMuscles } from '@/lib/region-to-muscle';
import { computeLeaderboard } from '@/lib/scoring';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, TwilioMessage, ActivityLog } from '@reflect-live/shared';

// Joints with no body-map shape (currently elbow + wrist) should not
// appear in activity / rehab counts. They're still valid for injury
// reports — pain in the joint is real — but they aren't a "muscle
// worked" by a workout, and crediting them would surface them in the
// side list with no corresponding silhouette paint to back them up.
function paintsAnyMuscle(region: string): boolean {
  return regionToMuscles(region, 'front').length > 0
    || regionToMuscles(region, 'back').length > 0;
}

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
    // parseAllRegions returns every body region referenced in the
    // description (a workout typically hits several). Each region the
    // log mentions counts as one session for that region — except
    // joint-only regions with no body-map shape (elbow, wrist), which
    // shouldn't be credited as muscles "worked" by a session.
    for (const region of parseAllRegions(r.description)) {
      if (!paintsAnyMuscle(region)) continue;
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
  // Most recent inbound message ever — drives "Last on wire" + the status
  // pill. Kept independent of `period` so narrowing the window doesn't
  // make the timestamp disappear.
  const [lastInboundEver, setLastInboundEver] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(30);
  // Athlete's rank within the team for the configured competition window
  // (or all-time when team.competition_start_date is null). Independent
  // of `period` so the rank reflects the season, not the visible window.
  const [seasonRank, setSeasonRank] = useState<number | null>(null);
  const [seasonRankTotal, setSeasonRankTotal] = useState<number | null>(null);
  // Region filter driven by clicks on the body heatmap. Empty = no
  // filter; otherwise the heatmap silhouette draws a click-highlight
  // ring on these regions and the timeline narrows to entries that
  // mention them. Shared across all 3 heatmap tabs so the filter
  // persists when the user flips between Injury / Activity / Rehab.
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

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

  // Independent of `period` — competition rank reflects the season the
  // coach configured (team.competition_start_date), not the visible
  // window. Falls back to all-time when no season is set.
  useEffect(() => {
    let alive = true;
    (async () => {
      const sinceISO = team.competition_start_date
        ? `${team.competition_start_date}T00:00:00Z`
        : undefined;
      const rows = await computeLeaderboard(sb, team.id, team.scoring_json, sinceISO);
      if (!alive) return;
      const idx = rows.findIndex((r) => r.player_id === playerId);
      setSeasonRank(idx === -1 ? null : idx + 1);
      setSeasonRankTotal(rows.length || null);
    })();
    return () => { alive = false; };
  }, [sb, team.id, team.scoring_json, team.competition_start_date, playerId]);

  // Independent of `period` — fetches the player's most recent inbound
  // message ever. Drives "Last on wire" + the status pill so neither
  // disappears when the user narrows the time window.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await sb
        .from('twilio_messages')
        .select('date_sent')
        .eq('player_id', playerId)
        .eq('direction', 'inbound')
        .order('date_sent', { ascending: false })
        .limit(1)
        .maybeSingle<{ date_sent: string }>();
      if (!alive) return;
      setLastInboundEver(data?.date_sent ?? null);
    })();
    return () => { alive = false; };
  }, [sb, playerId]);

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
    const flags = surveyReadings.filter((n) => n <= 4).length;
    // Per-period activity totals — drives the personal counters in the
    // hero. Logs already de-duplicate on source_sid (worker insert), so
    // a workout text logged once via SMS counts once here.
    const workouts = logs.filter((l) => l.kind === 'workout' && !l.hidden).length;
    const rehabs = logs.filter((l) => l.kind === 'rehab' && !l.hidden).length;
    // lastInbound is intentionally NOT period-scoped — it comes from
    // lastInboundEver so the "Last on wire" timestamp + status pill
    // persist when the user narrows the window.
    return {
      avgReadiness,
      responses: surveyReadings.length,
      flags,
      workouts,
      rehabs,
      lastInbound: lastInboundEver,
    };
  }, [msgs, logs, lastInboundEver]);

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
          seasonRank={seasonRank}
          seasonRankTotal={seasonRankTotal}
          seasonStart={team.competition_start_date ?? null}
        />
        <HeatmapTabs
          injuryCounts={injuryCounts}
          activityCounts={activityCounts}
          rehabCounts={rehabCounts}
          injuryRows={injurySideRows}
          gender={(player.gender ?? team.default_gender ?? 'male')}
          selectedRegions={selectedRegions}
          onMuscleClick={(regions) => {
            // Clicking the same muscle clears the filter; clicking a
            // different one replaces it. Always derive a sorted, deduped
            // set so click on biceps + click again toggles cleanly.
            const next = Array.from(new Set(regions)).sort();
            const same =
              selectedRegions.length === next.length &&
              selectedRegions.every((r, i) => r === next[i]);
            setSelectedRegions(same ? [] : next);
          }}
        />
        <UnifiedTimeline
          logs={logs}
          messages={msgs}
          period={period}
          selectedRegions={selectedRegions}
          onClearRegionFilter={() => setSelectedRegions([])}
        />
      </main>
    </>
  );
}
