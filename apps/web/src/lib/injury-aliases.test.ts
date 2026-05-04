import { describe, it, expect } from 'vitest';
import { parseAllRegions } from './injury-aliases';

describe('parseAllRegions — push/pull/legs split', () => {
  it('push day → chest + shoulder + tricep', () => {
    const r = parseAllRegions('Workout: push day - bench, OHP, dips');
    expect(r).toEqual(expect.arrayContaining(['chest', 'shoulder', 'tricep']));
  });

  it('pull day → upper_back + bicep + forearm', () => {
    const r = parseAllRegions('Workout: pull day - rows + curls');
    expect(r).toEqual(expect.arrayContaining(['upper_back', 'bicep', 'forearm']));
  });

  it('leg day → quad + hamstring + hip + calf', () => {
    const r = parseAllRegions('leg day - squats and RDLs');
    expect(r).toEqual(expect.arrayContaining(['quad', 'hamstring', 'hip', 'calf']));
  });

  it('combined "push, pull, and leg days" extracts all three buckets', () => {
    const r = parseAllRegions('this week: push, pull, and leg days');
    // push: chest+shoulder+tricep, pull: upper_back+bicep+forearm, leg: quad+hamstring+hip+calf
    expect(r).toEqual(expect.arrayContaining([
      'chest', 'shoulder', 'tricep',
      'upper_back', 'bicep', 'forearm',
      'quad', 'hamstring', 'hip', 'calf',
    ]));
  });

  it('"upper body" → upper-body muscle set', () => {
    const r = parseAllRegions('upper body session');
    expect(r).toEqual(expect.arrayContaining(['chest', 'shoulder', 'bicep', 'tricep', 'upper_back']));
  });

  it('"lower body" → lower-body muscle set', () => {
    const r = parseAllRegions('Workout: lower body');
    expect(r).toEqual(expect.arrayContaining(['quad', 'hamstring', 'hip', 'calf']));
  });

  it('does not falsely match inside other words', () => {
    const r = parseAllRegions('legitimate stretching');
    expect(r).not.toContain('quad'); // 'leg' isn't a phrase, only 'legs' / 'leg day' etc.
  });

  it('"leg day" wins over bare "legs" — no double-credit', () => {
    // Both phrases would expand to the same set; we just confirm the
    // result deduplicates.
    const r = parseAllRegions('leg day legs');
    const counts: Record<string, number> = {};
    for (const x of r) counts[x] = (counts[x] ?? 0) + 1;
    for (const [k, v] of Object.entries(counts)) expect(v, `${k} duplicated`).toBe(1);
  });
});
