'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { PageHeader, useDashboard } from '@/components/dashboard-shell';
import { AthleteHero, type ActionVerb } from '@/components/v3/athlete-hero';
import { HeatmapTabs, type InjurySideRow } from '@/components/v3/heatmap-tabs';
import { UnifiedTimeline } from '@/components/v3/unified-timeline';
import { EditAthleteDialog } from '@/components/v3/edit-athlete-dialog';
import { LogActivityDialog } from '@/components/v3/log-activity-dialog';
import { ReportInjuryDialog } from '@/components/v3/report-injury-dialog';
import { SelfReportDialog } from '@/components/v3/self-report-dialog';
import { ManagePhonesDialog } from '@/components/v3/manage-phones-dialog';
import { UpcomingMeets } from '@/components/v3/upcoming-meets';
import { SurveyTrendsCard } from '@/components/v3/survey-trends-card';
import { buildSurveyTrends } from '@/lib/survey-trends';
import { Button } from '@/components/ui/button';
import { type Period, periodSinceIso } from '@/lib/period';
import { parseAllRegions } from '@/lib/injury-aliases';
import { regionToMuscles } from '@/lib/region-to-muscle';
import { computeLeaderboard } from '@/lib/scoring';
import { chatHrefForPerson, chatHrefForTeamNumber } from '@/lib/chat-link';
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

  // Roster-edit state. knownGroups feeds the group dropdown; linked
  // membership drives whether the captain toggle is enabled.
  const [editOpen, setEditOpen] = useState(false);
  const [knownGroups, setKnownGroups] = useState<string[]>([]);
  const [linkedMembership, setLinkedMembership] = useState<{
    hasLink: boolean;
    role: 'captain' | 'athlete' | null;
  }>({ hasLink: false, role: null });
  // Bump to force a re-fetch of the roster data after the dialog saves.
  const [rosterTick, setRosterTick] = useState(0);
  // Bump to force a re-fetch of the period-scoped data (msgs/logs/injuries)
  // when a manual log/injury lands. Goes into the first effect's deps so
  // the timeline + heatmap updates without a hard reload.
  const [dataTick, setDataTick] = useState(0);
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [logActivityKind, setLogActivityKind] = useState<'workout' | 'rehab'>('workout');
  const [reportInjuryOpen, setReportInjuryOpen] = useState(false);
  const [selfReportOpen, setSelfReportOpen] = useState(false);
  const [phonesOpen, setPhonesOpen] = useState(false);
  // Count of alternate (non-primary) phones — drives the '+N' pill on
  // the identity card so the coach knows alternates exist without
  // opening the dialog. Refetched whenever rosterTick bumps.
  const [alternatePhoneCount, setAlternatePhoneCount] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const since = periodSinceIso(period);

      // Limit bumped from 200 → 1000 so the 'all' period actually
      // captures every reply for athletes with longer histories. The
      // Score trends heatmap was undercounting on 'all' because rows
      // 201+ were being dropped silently.
      const msgQ = sb
        .from('twilio_messages')
        .select('*')
        .eq('player_id', playerId)
        .order('date_sent', { ascending: false })
        .limit(1000);
      const logQ = sb
        .from('activity_logs')
        .select('*')
        .eq('player_id', playerId)
        .eq('hidden', false)
        .order('logged_at', { ascending: false })
        .limit(1000);
      const injQ = sb
        .from('injury_reports')
        .select('id,regions,severity,description,reported_at,resolved_at')
        .eq('player_id', playerId)
        .order('reported_at', { ascending: false })
        .limit(1000);

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
  }, [sb, playerId, period, dataTick]);

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

  // Roster-edit support: pull the team's existing groups for the
  // dropdown, the player's linked membership for the captain toggle,
  // and the player's own row (so a group/role change reflects in the
  // identity card without a hard reload). Refetches on rosterTick so
  // the dialog's onSaved callback can ask for fresh data.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: teamPlayers }, { data: linkRow }, { data: freshPlayer }] = await Promise.all([
        sb.from('players').select('group').eq('team_id', team.id),
        sb
          .from('team_memberships')
          .select('clerk_user_id, role, status')
          .eq('team_id', team.id)
          .eq('player_id', playerId)
          .eq('status', 'active')
          .maybeSingle<{ clerk_user_id: string; role: string; status: string }>(),
        sb.from('players').select('*').eq('id', playerId).maybeSingle(),
      ]);
      if (!alive) return;
      const set = new Set<string>();
      for (const row of (teamPlayers ?? []) as Array<{ group: string | null }>) {
        if (row.group) set.add(row.group);
      }
      setKnownGroups(Array.from(set).sort());
      if (linkRow) {
        const role = linkRow.role === 'captain' ? 'captain' : 'athlete';
        setLinkedMembership({ hasLink: true, role });
      } else {
        setLinkedMembership({ hasLink: false, role: null });
      }
      if (freshPlayer) setPlayer(freshPlayer as Player);

      // Pull alternate phone count via the API (service-role, bypasses
      // RLS) so the '+N' chip reflects reality even if the browser
      // Supabase JWT isn't propagating perfectly.
      try {
        const r = await fetch(`/api/players/${playerId}/phones`);
        if (r.ok) {
          const j = await r.json();
          const phones = (j.phones ?? []) as Array<{ is_primary: boolean }>;
          if (alive) setAlternatePhoneCount(phones.filter((p) => !p.is_primary).length);
        } else if (alive) {
          setAlternatePhoneCount(0);
        }
      } catch {
        if (alive) setAlternatePhoneCount(0);
      }
    })();
    return () => { alive = false; };
  }, [sb, team.id, playerId, rosterTick]);

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

  // Group numeric survey replies by their paired question so the
  // trends card can render one mini-chart per distinct question.
  // Only rebuilds when msgs change, not on every period flip.
  const surveyTrends = useMemo(() => buildSurveyTrends(msgs), [msgs]);

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

  // Anyone (athlete, captain, or coach who's also on the roster) viewing
  // their OWN player page gets the self affordances — Self-report / Log
  // workout / Report injury — instead of the manage-someone-else set.
  // Driven by the role you're currently viewing as (prefs.role) plus
  // the impersonate target. A platform admin who role-switches to
  // 'athlete' wants the athlete experience, including the
  // 'Text a workout' button that goes to the team Twilio number — not
  // the coach 'Text' button that opens a chat to this player's
  // personal phone. The previous gate hid the self set behind
  // !is_platform_admin so admins-in-athlete-view stayed in coach mode.
  const viewerIsSelf =
    prefs.impersonate_player_id === player.id &&
    (prefs.role === 'athlete' || prefs.role === 'captain');
  // Roster edits — coach on this team, or platform admin. Mirrors the
  // server-side requireRosterManager check on PATCH /api/players/[id].
  const viewerCanEdit =
    prefs.is_platform_admin === true || prefs.role === 'coach' || prefs.role === 'admin';
  // Phone is always visible: when viewer is the athlete it's their own
  // number; when viewer is a coach/captain/admin they have legit access.
  const showPhone = true;

  function onAction(verb: ActionVerb) {
    switch (verb) {
      case 'text': {
        // Coach → athlete. Default to WhatsApp via wa.me — works
        // cross-country (most international athletes don't have iMessage),
        // and matches the channel the team's Twilio bot is on so the
        // athlete reads coach + bot messages in one app.
        const href = player ? chatHrefForPerson(player.phone_e164) : null;
        if (href) window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      case 'log_via_whatsapp': {
        // Athlete-self quick action: hop into WhatsApp pre-typed with
        // 'Workout: ' so the next thing they do is just describe what
        // they did. The bot tags inbound messages by the player_id
        // resolved from their phone, so no team-code or marker needed
        // in the body.
        const teamNum = (team as { twilio_phone_number?: string | null } | null)?.twilio_phone_number ?? null;
        const href = chatHrefForTeamNumber(teamNum, 'Workout: ');
        if (href) {
          window.open(href, '_blank', 'noopener,noreferrer');
        } else {
          // Defensive: no team twilio config. Fall back to opening the
          // log-workout dialog so the athlete still has a path.
          setLogActivityKind('workout');
          setLogActivityOpen(true);
        }
        return;
      }
      case 'mark_injury_resolved':
        router.push('/dashboard/heatmap');
        return;
      case 'log_workout':
        setLogActivityKind('workout');
        setLogActivityOpen(true);
        return;
      case 'report_injury':
        setReportInjuryOpen(true);
        return;
      case 'self_report':
        setSelfReportOpen(true);
        return;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Athlete"
        title={player.name}
        actions={viewerCanEdit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="gap-1.5"
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        ) : undefined}
      />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {viewerCanEdit && (
          <EditAthleteDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            player={{ id: player.id, name: player.name, group: player.group }}
            knownGroups={knownGroups}
            hasLinkedMembership={linkedMembership.hasLink}
            membershipRole={linkedMembership.role}
            onSaved={() => setRosterTick((n) => n + 1)}
          />
        )}
        <LogActivityDialog
          open={logActivityOpen}
          onOpenChange={setLogActivityOpen}
          playerId={player.id}
          playerName={player.name}
          viewerIsSelf={viewerIsSelf}
          defaultKind={logActivityKind}
          onSaved={() => setDataTick((n) => n + 1)}
        />
        <ReportInjuryDialog
          open={reportInjuryOpen}
          onOpenChange={setReportInjuryOpen}
          playerId={player.id}
          viewerIsSelf={viewerIsSelf}
          onSaved={() => setDataTick((n) => n + 1)}
        />
        {viewerIsSelf && (
          <SelfReportDialog
            open={selfReportOpen}
            onOpenChange={setSelfReportOpen}
            playerId={player.id}
            onSaved={() => setDataTick((n) => n + 1)}
          />
        )}
        {(viewerCanEdit || viewerIsSelf) && (
          <ManagePhonesDialog
            open={phonesOpen}
            onOpenChange={setPhonesOpen}
            playerId={player.id}
            playerName={player.name}
            onSaved={() => setRosterTick((n) => n + 1)}
          />
        )}
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
          onManagePhones={
            viewerCanEdit || viewerIsSelf ? () => setPhonesOpen(true) : undefined
          }
          alternatePhoneCount={alternatePhoneCount}
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
        <UpcomingMeets teamId={team.id} />
        <SurveyTrendsCard trends={surveyTrends} period={period} />
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
