import { describe, it, expect } from 'vitest';
import { computeEngagement, type EngagementInput } from './engagement';

const DAY_MS = 24 * 3600 * 1000;
const NOW = Date.parse('2026-06-18T12:00:00Z');

// A log `d` days before NOW for the given player.
function log(player_id: number, d: number) {
  return { player_id, logged_at: new Date(NOW - d * DAY_MS).toISOString() };
}

// Build input at a 7-day window with one player and an explicit log set.
function input(logs: EngagementInput['logs'], windowDays: number | null = 7): EngagementInput {
  return {
    players: [{ id: 1, name: 'Ada', group: 'Sprint' }],
    logs,
    windowDays,
    now: NOW,
  };
}

function only(rows: ReturnType<typeof computeEngagement>) {
  return rows.find((r) => r.player_id === 1)!;
}

describe('computeEngagement', () => {
  it('flags a regular who went silent as quiet', () => {
    // baseline: 12 logs in days 8–35 (~3/wk); window: 0
    const baseline = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32].map((d) => log(1, d));
    const r = only(computeEngagement(input(baseline)));
    expect(r.bucket).toBe('quiet');
    expect(r.windowCount).toBe(0);
    expect(r.baselineRate).toBe(3);
  });

  it('flags a regular who halved as cooling', () => {
    // baseline 16 logs in days 8–35 (4/wk); window: 1 log
    const baseline = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 34, 12, 14].map((d) => log(1, d));
    const r = only(computeEngagement(input([...baseline, log(1, 2)])));
    expect(r.bucket).toBe('cooling');
    expect(r.windowCount).toBe(1);
  });

  it('flags a ramping regular as heating', () => {
    // baseline 8 logs in days 8–35 (2/wk); window: 5 logs
    const baseline = [10, 14, 18, 22, 26, 30, 12, 16].map((d) => log(1, d));
    const windowLogs = [1, 2, 3, 4, 5].map((d) => log(1, d));
    const r = only(computeEngagement(input([...baseline, ...windowLogs])));
    expect(r.bucket).toBe('heating');
    expect(r.windowCount).toBe(5);
  });

  it('flags a previously-inactive athlete who is now logging as heating', () => {
    // no baseline; window: 3 logs (max(baseline,1) lets this read as heating)
    const r = only(computeEngagement(input([1, 2, 3].map((d) => log(1, d)))));
    expect(r.bucket).toBe('heating');
  });

  it('treats a steady regular as steady (not flagged)', () => {
    // baseline 16 logs (4/wk); window 4 logs — neither heating nor cooling
    const baseline = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 34, 12, 14].map((d) => log(1, d));
    const windowLogs = [1, 2, 3, 4].map((d) => log(1, d));
    const r = only(computeEngagement(input([...baseline, ...windowLogs])));
    expect(r.bucket).toBe('steady');
  });

  it('treats a never-engaged athlete as new (not flagged)', () => {
    const r = only(computeEngagement(input([])));
    expect(r.bucket).toBe('new');
    expect(r.baselineRate).toBe(0);
  });

  it('includes baseline exactly at the regular floor', () => {
    // baseline 8 logs in days 8–35 (= 2/wk = REGULAR_FLOOR); window 0 → quiet
    const baseline = [10, 13, 16, 19, 22, 25, 28, 31].map((d) => log(1, d));
    const r = only(computeEngagement(input(baseline)));
    expect(r.baselineRate).toBe(2);
    expect(r.bucket).toBe('quiet');
  });

  it('treats cooling boundary (windowCount == baseline×0.5) as cooling', () => {
    // baseline 16 logs (4/wk); window exactly 2 (= 0.5×4)
    const baseline = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 34, 12, 14].map((d) => log(1, d));
    const r = only(computeEngagement(input([...baseline, log(1, 2), log(1, 3)])));
    expect(r.windowCount).toBe(2);
    expect(r.bucket).toBe('cooling');
  });

  it('windowDays = null ("all") returns raw all-time counts as new', () => {
    const logs = [1, 9, 40, 100].map((d) => log(1, d));
    const r = only(computeEngagement(input(logs, null)));
    expect(r.bucket).toBe('new');
    expect(r.windowCount).toBe(4);
    expect(r.baselineRate).toBe(0);
  });

  it('reports the most recent log as lastActive', () => {
    const r = only(computeEngagement(input([log(1, 2), log(1, 20)])));
    expect(r.lastActive).toBe(new Date(NOW - 2 * DAY_MS).toISOString());
  });
});
