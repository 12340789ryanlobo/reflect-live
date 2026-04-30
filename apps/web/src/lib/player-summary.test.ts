import { describe, it, expect } from 'vitest';
import {
  rulesBasedSummary,
  hashSummaryInputs,
  generateCacheKey,
  type ResponseRow,
  type FlagRow,
  type ActivityLogRow,
  type InjuryRow,
  type TwilioMessageRow,
} from './player-summary';

function r(partial: Partial<ResponseRow>): ResponseRow {
  return {
    session_id: 1,
    question_id: 'q1_readiness',
    answer_raw: null,
    answer_num: null,
    created_at: '2026-04-29T00:00:00Z',
    ...partial,
  };
}

function f(partial: Partial<FlagRow>): FlagRow {
  return {
    flag_type: 'low_readiness',
    severity: 'low',
    details: null,
    created_at: '2026-04-29T00:00:00Z',
    ...partial,
  };
}

describe('rulesBasedSummary', () => {
  it('handles zero sessions cleanly', () => {
    const s = rulesBasedSummary({ playerName: 'Alice', responses: [], flags: [], days: 14 });
    expect(s.summary).toMatch(/no check-in or activity data/i);
    expect(s.observations).toContain('No recent responses recorded');
    expect(s.generated_by).toBe('rules');
    expect(s.confidence).toBe('low');
  });

  it('flags below-average readiness', () => {
    const responses = [
      r({ session_id: 1, answer_num: 4 }),
      r({ session_id: 2, answer_num: 3 }),
      r({ session_id: 3, answer_num: 4 }),
    ];
    const s = rulesBasedSummary({ playerName: 'Bob', responses, flags: [], days: 14 });
    expect(s.observations.some((o) => /below-average/i.test(o))).toBe(true);
    expect(s.recommendations.some((rec) => /readiness/i.test(rec))).toBe(true);
    expect(s.confidence).toBe('high'); // 3 sessions
  });

  it('surfaces injury reports in observations + recommendations', () => {
    const responses = [
      r({ session_id: 1, question_id: 'q2_injury', answer_num: 1 }),
      r({ session_id: 1, question_id: 'q1_readiness', answer_num: 7 }),
    ];
    const s = rulesBasedSummary({ playerName: 'Carla', responses, flags: [], days: 14 });
    expect(s.observations.some((o) => /injury/i.test(o))).toBe(true);
    expect(s.recommendations.some((rec) => /trainer/i.test(rec))).toBe(true);
  });

  it('surfaces high-severity flags', () => {
    const responses = [r({ session_id: 1, answer_num: 8 })];
    const flags = [f({ severity: 'high', flag_type: 'load_spike' })];
    const s = rulesBasedSummary({ playerName: 'Dee', responses, flags, days: 14 });
    expect(s.observations.some((o) => /high-priority/i.test(o))).toBe(true);
  });
});

describe('rulesBasedSummary with extended sources', () => {
  function log(partial: Partial<ActivityLogRow>): ActivityLogRow {
    return {
      kind: 'workout',
      description: 'lifted',
      logged_at: '2026-04-29T00:00:00Z',
      hidden: false,
      ...partial,
    };
  }

  function inj(partial: Partial<InjuryRow>): InjuryRow {
    return {
      regions: ['shoulder'],
      severity: 6,
      description: 'pain after sets',
      reported_at: '2026-04-28T00:00:00Z',
      resolved_at: null,
      ...partial,
    };
  }

  function msg(partial: Partial<TwilioMessageRow>): TwilioMessageRow {
    return {
      direction: 'inbound',
      category: 'survey',
      body: '7 feeling solid',
      date_sent: '2026-04-29T00:00:00Z',
      ...partial,
    };
  }

  it('uses SMS readiness when no session readings exist', () => {
    const messages = [
      msg({ body: '8 great' }),
      msg({ body: '6 ok' }),
      msg({ body: '7 fine' }),
    ];
    const s = rulesBasedSummary({
      playerName: 'Greta',
      responses: [],
      flags: [],
      days: 14,
      messages,
    });
    expect(s.summary).toMatch(/3 check-in/i);
    expect(s.observations.some((o) => /good readiness/i.test(o))).toBe(true);
  });

  it('flags open injury concerns with body regions', () => {
    const s = rulesBasedSummary({
      playerName: 'Hank',
      responses: [],
      flags: [],
      days: 14,
      injuries: [inj({ regions: ['shoulder', 'lower_back'] })],
    });
    expect(s.observations.some((o) => /open injury/i.test(o) && /shoulder/i.test(o))).toBe(true);
    expect(s.recommendations.some((r) => /trainer/i.test(r))).toBe(true);
  });

  it('counts workouts and rehabs from activity logs', () => {
    const activityLogs = [
      log({ kind: 'workout', description: 'pull day' }),
      log({ kind: 'workout', description: 'leg day' }),
      log({ kind: 'rehab', description: 'shoulder mobility' }),
      log({ kind: 'workout', hidden: true }),
    ];
    const s = rulesBasedSummary({
      playerName: 'Iris',
      responses: [],
      flags: [],
      days: 14,
      activityLogs,
    });
    expect(s.summary).toMatch(/2 workouts/);
    expect(s.summary).toMatch(/1 rehab/);
  });

  it('flags absence of workouts when athlete is checking in but not logging', () => {
    const messages = [msg({ body: '7' }), msg({ body: '8' }), msg({ body: '6' })];
    const s = rulesBasedSummary({
      playerName: 'Jay',
      responses: [],
      flags: [],
      days: 14,
      messages,
    });
    expect(s.observations.some((o) => /no workouts logged/i.test(o))).toBe(true);
    expect(s.recommendations.some((r) => /workout logging/i.test(r))).toBe(true);
  });
});

describe('hashSummaryInputs', () => {
  it('is stable across reorderings of equal inputs', () => {
    const a = hashSummaryInputs(
      [r({ session_id: 1, answer_num: 5 }), r({ session_id: 2, answer_num: 6 })],
      [],
    );
    const b = hashSummaryInputs(
      [r({ session_id: 1, answer_num: 5 }), r({ session_id: 2, answer_num: 6 })],
      [],
    );
    expect(a).toBe(b);
  });

  it('changes when an answer changes', () => {
    const a = hashSummaryInputs([r({ answer_num: 5 })], []);
    const b = hashSummaryInputs([r({ answer_num: 6 })], []);
    expect(a).not.toBe(b);
  });
});

describe('generateCacheKey', () => {
  it('produces a 32-char hex key', () => {
    const k = generateCacheKey(42, 14, 'abc123');
    expect(k).toMatch(/^[a-f0-9]{32}$/);
  });

  it('changes with player_id, days, or data hash', () => {
    const base = generateCacheKey(42, 14, 'abc');
    expect(generateCacheKey(43, 14, 'abc')).not.toBe(base);
    expect(generateCacheKey(42, 7, 'abc')).not.toBe(base);
    expect(generateCacheKey(42, 14, 'xyz')).not.toBe(base);
  });

  it('treats "all" as a distinct period from any number', () => {
    const seven = generateCacheKey(42, 7, 'abc');
    const all = generateCacheKey(42, 'all', 'abc');
    expect(all).toMatch(/^[a-f0-9]{32}$/);
    expect(all).not.toBe(seven);
  });
});

describe('rulesBasedSummary with "all" period', () => {
  it('phrases the empty-data summary without a "last N days" clause', () => {
    const s = rulesBasedSummary({ playerName: 'Eve', responses: [], flags: [], days: 'all' });
    expect(s.summary).toMatch(/no check-in or activity data on record/i);
    expect(s.summary).not.toMatch(/last \d+ days/i);
  });

  it('phrases a non-empty summary using all-time language', () => {
    const responses = [
      r({ session_id: 1, answer_num: 7 }),
      r({ session_id: 2, answer_num: 8 }),
      r({ session_id: 3, answer_num: 6 }),
    ];
    const s = rulesBasedSummary({ playerName: 'Frank', responses, flags: [], days: 'all' });
    expect(s.summary).toMatch(/across all recorded data/i);
  });
});
