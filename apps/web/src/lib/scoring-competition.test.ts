// Unit tests for aggregateCompetition — the migration-0029 competition
// aggregator. Validates:
//   - Open-ended kind→points scoring
//   - Per-day stacking bonus rules (positive = reward)
//   - Per-day stacking penalties (negative = discourage)
//   - Tiered rules composing on the same kind
//   - Edge cases: unknown kinds, unknown players, empty inputs
//
// All tests target the pure function directly; no Supabase needed.

import { describe, expect, test } from 'vitest';
import { aggregateCompetition, type CompetitionInputEntry, type LeaderboardInputPlayer } from './scoring';
import type { CompetitionBonusRule } from '@reflect-live/shared';

const PLAYERS: LeaderboardInputPlayer[] = [
  { id: 1, name: 'Alice', group: 'Sprint' },
  { id: 2, name: 'Bob',   group: 'Distance' },
  { id: 3, name: 'Carla', group: null },
];

const SCORING = { swim: 2, workout: 1, rehab: 0.6 };

function entry(player_id: number, kind: string, day: string): CompetitionInputEntry {
  return { player_id, kind, day };
}

describe('aggregateCompetition — base scoring', () => {
  test('sums per-kind counts × scoring with no rules', () => {
    const entries = [
      entry(1, 'swim', '2026-06-01'),
      entry(1, 'workout', '2026-06-01'),
      entry(1, 'rehab', '2026-06-02'),
    ];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].player_id).toBe(1);
    expect(rows[0].counts).toEqual({ swim: 1, workout: 1, rehab: 1 });
    expect(rows[0].base_points).toBe(2 + 1 + 0.6);
    expect(rows[0].bonus_total).toBe(0);
    expect(rows[0].points).toBe(3.6);
  });

  test('drops players with no scored entries', () => {
    const rows = aggregateCompetition(PLAYERS, [entry(1, 'swim', '2026-06-01')], SCORING, []);
    expect(rows.map((r) => r.player_id)).toEqual([1]);
  });

  test('sorts by points DESC, then base_points DESC, then name', () => {
    const entries = [
      entry(1, 'swim', '2026-06-01'),                              // Alice: 2pts
      entry(2, 'swim', '2026-06-01'), entry(2, 'swim', '2026-06-02'), // Bob: 4pts
      entry(3, 'workout', '2026-06-01'), entry(3, 'workout', '2026-06-02'),
      entry(3, 'workout', '2026-06-03'), entry(3, 'workout', '2026-06-04'), // Carla: 4pts
    ];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, []);
    expect(rows.map((r) => r.name)).toEqual(['Bob', 'Carla', 'Alice']);
  });

  test('silently ignores kinds not in the scoring map', () => {
    const entries = [
      entry(1, 'swim', '2026-06-01'),
      entry(1, 'mystery_kind_added_later', '2026-06-01'),
    ];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, []);
    expect(rows[0].counts).toEqual({ swim: 1 });
    expect(rows[0].points).toBe(2);
  });

  test('skips entries from unknown player_ids', () => {
    const entries = [entry(1, 'swim', '2026-06-01'), entry(99, 'swim', '2026-06-01')];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, []);
    expect(rows.map((r) => r.player_id)).toEqual([1]);
  });
});

describe('aggregateCompetition — promote-stacking rules (positive bonus)', () => {
  const rules: CompetitionBonusRule[] = [
    { kind: 'swim', min_per_day: 2, bonus_points: 1 },
  ];

  test('2 swims same day → 2×2 + 1 = 5 points', () => {
    const entries = [entry(1, 'swim', '2026-06-01'), entry(1, 'swim', '2026-06-01')];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, rules);
    expect(rows[0].base_points).toBe(4);
    expect(rows[0].bonus_total).toBe(1);
    expect(rows[0].points).toBe(5);
  });

  test('1 swim/day for 2 days → no bonus fires', () => {
    const entries = [entry(1, 'swim', '2026-06-01'), entry(1, 'swim', '2026-06-02')];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, rules);
    expect(rows[0].base_points).toBe(4);
    expect(rows[0].bonus_total).toBe(0);
    expect(rows[0].points).toBe(4);
  });

  test('bonus fires once per qualifying day even with 5 entries', () => {
    const entries = Array.from({ length: 5 }, () => entry(1, 'swim', '2026-06-01'));
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, rules);
    expect(rows[0].base_points).toBe(10);
    expect(rows[0].bonus_total).toBe(1);  // single trigger, not per-extra
    expect(rows[0].points).toBe(11);
  });
});

describe('aggregateCompetition — discourage-stacking rules (negative bonus)', () => {
  // Matches the user's specific ask: 2 swims/day = doubles → 3pts total
  // (not 4). Implemented as a -1 adjustment when count >= 2.
  const rules: CompetitionBonusRule[] = [
    { kind: 'swim', min_per_day: 2, bonus_points: -1 },
  ];

  test('2 swims same day → 2×2 − 1 = 3 points (the doubles case)', () => {
    const entries = [entry(1, 'swim', '2026-06-01'), entry(1, 'swim', '2026-06-01')];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, rules);
    expect(rows[0].base_points).toBe(4);
    expect(rows[0].bonus_total).toBe(-1);
    expect(rows[0].points).toBe(3);
  });

  test('1 swim/day for 2 days → no penalty (rewards consistency)', () => {
    const entries = [entry(1, 'swim', '2026-06-01'), entry(1, 'swim', '2026-06-02')];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, rules);
    expect(rows[0].points).toBe(4);
  });
});

describe('aggregateCompetition — tiered rules composing', () => {
  // Coach: "doubles (-1) AND triples (-2)" → 3 swims/day eats 3pts total
  // because BOTH rules fire (count >= 2 AND count >= 3).
  const rules: CompetitionBonusRule[] = [
    { kind: 'swim', min_per_day: 2, bonus_points: -1 },
    { kind: 'swim', min_per_day: 3, bonus_points: -2 },
  ];

  test('2 swims/day → only the -1 rule fires', () => {
    const entries = [entry(1, 'swim', '2026-06-01'), entry(1, 'swim', '2026-06-01')];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, rules);
    expect(rows[0].bonus_total).toBe(-1);
    expect(rows[0].points).toBe(3);  // 2×2 − 1
  });

  test('3 swims/day → both rules fire', () => {
    const entries = [
      entry(1, 'swim', '2026-06-01'),
      entry(1, 'swim', '2026-06-01'),
      entry(1, 'swim', '2026-06-01'),
    ];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, rules);
    expect(rows[0].bonus_total).toBe(-3);  // -1 + -2
    expect(rows[0].points).toBe(3);  // 3×2 − 3
  });

  test('mixed days only apply rules where threshold met', () => {
    const entries = [
      entry(1, 'swim', '2026-06-01'),  // 1 swim, no rule fires
      entry(1, 'swim', '2026-06-02'),
      entry(1, 'swim', '2026-06-02'),  // 2 swims, -1 fires
    ];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, rules);
    expect(rows[0].base_points).toBe(6);
    expect(rows[0].bonus_total).toBe(-1);
    expect(rows[0].points).toBe(5);
  });
});

describe('aggregateCompetition — edge cases', () => {
  test('empty entries returns empty rows', () => {
    expect(aggregateCompetition(PLAYERS, [], SCORING, [])).toEqual([]);
  });

  test('empty scoring map returns empty rows even with entries', () => {
    const rows = aggregateCompetition(PLAYERS, [entry(1, 'swim', '2026-06-01')], {}, []);
    expect(rows).toEqual([]);
  });

  test('rules referring to unscored kinds are silently ignored', () => {
    const rules: CompetitionBonusRule[] = [
      { kind: 'mystery_kind', min_per_day: 2, bonus_points: 5 },
    ];
    const entries = [entry(1, 'swim', '2026-06-01')];
    const rows = aggregateCompetition(PLAYERS, entries, SCORING, rules);
    // Rule kind isn't in scoring so the entries weren't grouped under it;
    // the rule never sees a count >= min_per_day. Net: rule no-ops.
    expect(rows[0].bonus_total).toBe(0);
  });
});
