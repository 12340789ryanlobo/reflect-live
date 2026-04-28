// apps/web/src/lib/scoring.ts
//
// Phase 1 — fitness scoring helpers.
// Pure aggregation lives in `aggregateLeaderboard`; the supabase-aware fetch
// is `computeLeaderboard`. Tests target the pure function directly.
//
// Source-of-truth (split): workouts come from `activity_logs` (bulk-imported
// from reflect's API, kind='workout'); rehabs come from `twilio_messages`
// (category='rehab'). reflect's API doesn't expose rehabs in bulk, so they
// only land in twilio_messages — counting both sources gives the same totals
// reflect's leaderboard produces. Once the worker dual-writes SMS-tagged
// activity into activity_logs (deferred data-sync task), this can collapse
// back to a single source.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TeamScoring {
  workout_score: number;
  rehab_score: number;
}

export interface LeaderboardRow {
  player_id: number;
  name: string;
  group: string | null;
  workouts: number;
  rehabs: number;
  points: number;
}

export interface LeaderboardInputPlayer {
  id: number;
  name: string;
  group: string | null;
}

/**
 * One activity entry contributing to scoring. Currently sourced from
 * `activity_logs.kind`; the type leaves room for additional kinds without
 * affecting the aggregator (anything that isn't 'workout' or 'rehab' is
 * silently ignored).
 */
export interface LeaderboardInputEntry {
  player_id: number;
  kind: 'workout' | 'rehab' | string;
}

/**
 * Pure aggregation. Given the active roster and a list of activity entries
 * (already filtered to `kind` workout/rehab), compute the leaderboard.
 *
 * Sort: points DESC → workouts DESC → rehabs DESC → name ASC.
 * Players with zero contributing entries are excluded.
 */
export function aggregateLeaderboard(
  players: LeaderboardInputPlayer[],
  entries: LeaderboardInputEntry[],
  scoring: TeamScoring,
): LeaderboardRow[] {
  const counts = new Map<number, { workouts: number; rehabs: number }>();
  for (const e of entries) {
    if (e.kind !== 'workout' && e.kind !== 'rehab') continue;
    const existing = counts.get(e.player_id) ?? { workouts: 0, rehabs: 0 };
    if (e.kind === 'workout') existing.workouts += 1;
    else existing.rehabs += 1;
    counts.set(e.player_id, existing);
  }

  const playerById = new Map(players.map((p) => [p.id, p]));
  const rows: LeaderboardRow[] = [];
  for (const [player_id, c] of counts) {
    const p = playerById.get(player_id);
    if (!p) continue; // unknown player — drop
    const points = c.workouts * scoring.workout_score + c.rehabs * scoring.rehab_score;
    rows.push({
      player_id,
      name: p.name,
      group: p.group,
      workouts: c.workouts,
      rehabs: c.rehabs,
      points,
    });
  }

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.workouts !== a.workouts) return b.workouts - a.workouts;
    if (b.rehabs !== a.rehabs) return b.rehabs - a.rehabs;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

/**
 * Fetch + aggregate. Used by Activity page render.
 *
 * Workouts: activity_logs.kind='workout' (filterable by logged_at >= sinceISO).
 * Rehabs:   twilio_messages.category='rehab' (filterable by date_sent >= sinceISO).
 *
 * @param sb        supabase client
 * @param teamId    team to score
 * @param scoring   point values
 * @param sinceISO  optional lower bound (omit for all-time)
 */
export async function computeLeaderboard(
  sb: SupabaseClient,
  teamId: number,
  scoring: TeamScoring,
  sinceISO?: string,
): Promise<LeaderboardRow[]> {
  const { data: playersData } = await sb
    .from('players')
    .select('id,name,group')
    .eq('team_id', teamId)
    .eq('active', true);

  const players: LeaderboardInputPlayer[] = (playersData ?? []) as LeaderboardInputPlayer[];

  let workoutsQ = sb
    .from('activity_logs')
    .select('player_id,kind')
    .eq('team_id', teamId)
    .eq('kind', 'workout')
    .not('player_id', 'is', null);
  if (sinceISO) workoutsQ = workoutsQ.gte('logged_at', sinceISO);

  let rehabsQ = sb
    .from('twilio_messages')
    .select('player_id,category')
    .eq('team_id', teamId)
    .eq('category', 'rehab')
    .not('player_id', 'is', null);
  if (sinceISO) rehabsQ = rehabsQ.gte('date_sent', sinceISO);

  const [{ data: workoutRows }, { data: rehabRows }] = await Promise.all([workoutsQ, rehabsQ]);

  const entries: LeaderboardInputEntry[] = [
    ...((workoutRows ?? []) as Array<{ player_id: number }>).map((r) => ({
      player_id: r.player_id,
      kind: 'workout' as const,
    })),
    ...((rehabRows ?? []) as Array<{ player_id: number }>).map((r) => ({
      player_id: r.player_id,
      kind: 'rehab' as const,
    })),
  ];

  return aggregateLeaderboard(players, entries, scoring);
}

/**
 * The instant of the most recent Monday 00:00 in America/Chicago, expressed
 * as a UTC `Date`. Used as the lower bound for the weekly leaderboard.
 */
export function weekStartCT(): Date {
  const now = new Date();
  // Format current instant as CT components using sv-SE which produces "YYYY-MM-DD HH:mm:ss"
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const isoLocal = fmt.format(now).replace(' ', 'T');
  const ctNow = new Date(isoLocal + 'Z'); // treat as UTC instant (it represents CT wall-clock)
  const day = ctNow.getUTCDay(); // 0 Sun..6 Sat
  const daysSinceMonday = (day + 6) % 7;
  ctNow.setUTCDate(ctNow.getUTCDate() - daysSinceMonday);
  ctNow.setUTCHours(0, 0, 0, 0);
  // Convert the CT wall-clock back to a real UTC instant
  const offsetMs = now.getTime() - new Date(fmt.format(now).replace(' ', 'T') + 'Z').getTime();
  return new Date(ctNow.getTime() + offsetMs);
}
