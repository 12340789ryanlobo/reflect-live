'use client';

// Team activity leaderboards (this week + all-time) for the Competitions
// landing — restored alongside the team activity feed from the old
// /dashboard/fitness page. Ranks athletes by workout/rehab points using
// the team's scoring config, across all activity (not a single
// competition window). The viewer's own row is highlighted.

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase-browser';
import { Leaderboard } from '@/components/v3/leaderboard';
import { computeLeaderboard, weekStartCT, type LeaderboardRow, type TeamScoring } from '@/lib/scoring';

export function TeamLeaderboards({
  teamId,
  scoring,
  highlightPlayerId,
}: {
  teamId: number;
  scoring: TeamScoring;
  highlightPlayerId?: number;
}) {
  const sb = useSupabase();
  const [weekRows, setWeekRows] = useState<LeaderboardRow[]>([]);
  const [allTimeRows, setAllTimeRows] = useState<LeaderboardRow[]>([]);

  const workoutScore = scoring.workout_score;
  const rehabScore = scoring.rehab_score;
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      const sc = { workout_score: workoutScore, rehab_score: rehabScore };
      const sinceISO = weekStartCT().toISOString();
      const [week, allTime] = await Promise.all([
        computeLeaderboard(sb, teamId, sc, sinceISO),
        computeLeaderboard(sb, teamId, sc),
      ]);
      if (cancelled) return;
      setWeekRows(week);
      setAllTimeRows(allTime);
    })();
    return () => { cancelled = true; };
  }, [sb, teamId, workoutScore, rehabScore]);

  return (
    <section className="reveal reveal-3 grid gap-6 md:grid-cols-2">
      <Leaderboard title="This week" rows={weekRows} scoring={scoring} highlightPlayerId={highlightPlayerId} />
      <Leaderboard title="All time" rows={allTimeRows} scoring={scoring} highlightPlayerId={highlightPlayerId} />
    </section>
  );
}
