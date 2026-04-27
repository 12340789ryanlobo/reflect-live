import { describe, expect, test } from 'bun:test';
import {
  aggregateLeaderboard,
  weekStartCT,
  type LeaderboardInputMessage,
  type LeaderboardInputPlayer,
  type TeamScoring,
} from '@/lib/scoring';

const SCORING: TeamScoring = { workout_score: 1.0, rehab_score: 0.5 };

const PLAYERS: LeaderboardInputPlayer[] = [
  { id: 1, name: 'Alice Anderson', group: null },
  { id: 2, name: 'Bob Brown', group: 'sprint' },
  { id: 3, name: 'Cam Chen', group: 'distance' },
];

describe('aggregateLeaderboard', () => {
  test('empty input returns empty array', () => {
    const result = aggregateLeaderboard([], [], SCORING);
    expect(result).toEqual([]);
  });

  test('only includes players with at least one contributing message', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      player_id: 1,
      name: 'Alice Anderson',
      group: null,
      workouts: 1,
      rehabs: 0,
      points: 1,
    });
  });

  test('counts workouts and rehabs separately and computes points', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 1, category: 'workout' },
      { player_id: 1, category: 'rehab' },
      { player_id: 2, category: 'workout' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    // Alice: 2 workouts × 1.0 + 1 rehab × 0.5 = 2.5
    // Bob: 1 workout × 1.0 = 1.0
    expect(result).toEqual([
      { player_id: 1, name: 'Alice Anderson', group: null, workouts: 2, rehabs: 1, points: 2.5 },
      { player_id: 2, name: 'Bob Brown', group: 'sprint', workouts: 1, rehabs: 0, points: 1.0 },
    ]);
  });

  test('ignores survey and chat categories', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'survey' },
      { player_id: 1, category: 'chat' },
      { player_id: 2, category: 'workout' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    expect(result).toHaveLength(1);
    expect(result[0].player_id).toBe(2);
  });

  test('tiebreaker: equal points → more workouts wins', () => {
    // Alice: 1 workout = 1pt. Bob: 2 rehabs = 1pt. Alice has more workouts.
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 2, category: 'rehab' },
      { player_id: 2, category: 'rehab' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    expect(result.map((r) => r.player_id)).toEqual([1, 2]);
  });

  test('tiebreaker: equal points and workouts → more rehabs wins', () => {
    // Alice: 1 workout + 0 rehab = 1pt. Bob: 1 workout + 0 rehab = 1pt. Cam: 1 workout + 1 rehab = 1.5pt.
    // Add a case where Alice and Bob both have 1 workout but Bob has 1 rehab too.
    const scoring: TeamScoring = { workout_score: 1.0, rehab_score: 0.0 }; // make rehab worth 0 to force tie
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 2, category: 'workout' },
      { player_id: 2, category: 'rehab' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, scoring);
    // Alice: 1w 0r 1pt. Bob: 1w 1r 1pt. Same points, same workouts, Bob wins on rehabs.
    expect(result.map((r) => r.player_id)).toEqual([2, 1]);
  });

  test('tiebreaker: identical counts → alphabetical by name', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 2, category: 'workout' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    // Alice and Bob both have 1 workout, 0 rehab, 1pt. Alice < Bob alphabetically.
    expect(result.map((r) => r.player_id)).toEqual([1, 2]);
  });

  test('messages with player_id not in players list are ignored', () => {
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 999, category: 'workout' }, // unknown player
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, SCORING);
    expect(result).toHaveLength(1);
    expect(result[0].player_id).toBe(1);
  });

  test('respects custom scoring values', () => {
    const scoring: TeamScoring = { workout_score: 5.0, rehab_score: 2.5 };
    const messages: LeaderboardInputMessage[] = [
      { player_id: 1, category: 'workout' },
      { player_id: 1, category: 'rehab' },
    ];
    const result = aggregateLeaderboard(PLAYERS, messages, scoring);
    expect(result[0].points).toBe(7.5);
  });
});

describe('weekStartCT', () => {
  test('returns a Date instance', () => {
    expect(weekStartCT()).toBeInstanceOf(Date);
  });

  test('returns a Monday in Central Time', () => {
    const ws = weekStartCT();
    // Format the returned UTC instant in America/Chicago and check the weekday.
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
    });
    expect(fmt.format(ws)).toBe('Mon');
  });

  test('returns midnight (00:00) Central Time', () => {
    const ws = weekStartCT();
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const formatted = fmt.format(ws);
    // formatter renders something like "00:00"; allow either "00:00" or "0:00"
    expect(formatted.replace(/^(\d):/, '0$1:')).toBe('00:00');
  });

  test('is in the past or present, not future', () => {
    const ws = weekStartCT();
    expect(ws.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('is within the last 7 days', () => {
    const ws = weekStartCT();
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    expect(ws.getTime()).toBeGreaterThanOrEqual(sevenDaysAgo);
  });
});
