// apps/web/src/lib/scoring.ts
//
// Phase 1 — fitness scoring helpers.
// Pure aggregation lives in `aggregateLeaderboard`; the supabase-aware fetch
// is `computeLeaderboard`. Tests target the pure function directly.

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

export interface LeaderboardInputMessage {
  player_id: number;
  category: 'workout' | 'rehab' | 'survey' | 'chat';
}

/**
 * Pure aggregation. Given the active roster and a list of inbound messages
 * (already filtered to category workout/rehab), compute the leaderboard.
 *
 * Sort: points DESC → workouts DESC → rehabs DESC → name ASC.
 * Players with zero contributing messages are excluded.
 */
export function aggregateLeaderboard(
  players: LeaderboardInputPlayer[],
  messages: LeaderboardInputMessage[],
  scoring: TeamScoring,
): LeaderboardRow[] {
  const counts = new Map<number, { workouts: number; rehabs: number }>();
  for (const m of messages) {
    if (m.category !== 'workout' && m.category !== 'rehab') continue;
    const existing = counts.get(m.player_id) ?? { workouts: 0, rehabs: 0 };
    if (m.category === 'workout') existing.workouts += 1;
    else existing.rehabs += 1;
    counts.set(m.player_id, existing);
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
 * @param sb        supabase client
 * @param teamId    team to score
 * @param scoring   point values
 * @param sinceISO  optional lower bound on date_sent (omit for all-time)
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

  let q = sb
    .from('twilio_messages')
    .select('player_id,category')
    .eq('team_id', teamId)
    .eq('direction', 'inbound')
    .in('category', ['workout', 'rehab'])
    .not('player_id', 'is', null);

  if (sinceISO) q = q.gte('date_sent', sinceISO);

  const { data: msgsData } = await q;
  const messages: LeaderboardInputMessage[] = ((msgsData ?? []) as Array<{
    player_id: number;
    category: string;
  }>).map((m) => ({
    player_id: m.player_id,
    category: m.category as LeaderboardInputMessage['category'],
  }));

  return aggregateLeaderboard(players, messages, scoring);
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
