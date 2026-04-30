import { describe, expect, test } from 'bun:test';
import { parseInjuryRegions, regionLabel } from '@/lib/injury-aliases';

describe('parseInjuryRegions', () => {
  test('empty / null input → other', () => {
    expect(parseInjuryRegions('')).toEqual(['other']);
    expect(parseInjuryRegions(null)).toEqual(['other']);
    expect(parseInjuryRegions(undefined)).toEqual(['other']);
  });

  test('canonical region name passes through', () => {
    expect(parseInjuryRegions('knee')).toEqual(['knee']);
    expect(parseInjuryRegions('lower_back')).toEqual(['lower_back']);
  });

  test('strips side indicators', () => {
    expect(parseInjuryRegions('left wrist')).toEqual(['wrist']);
    expect(parseInjuryRegions('R knee')).toEqual(['knee']);
    expect(parseInjuryRegions('both ankles')).toEqual(['ankle']);
  });

  test('alias maps to canonical', () => {
    expect(parseInjuryRegions('hammy')).toEqual(['hamstring']);
    expect(parseInjuryRegions('tennis elbow')).toEqual(['elbow']);
    expect(parseInjuryRegions('rotator cuff')).toEqual(['shoulder']);
    expect(parseInjuryRegions('shin splints')).toEqual(['shin']);
    expect(parseInjuryRegions('IT band')).toEqual(['hip']);
  });

  test('multiple regions in one description', () => {
    const r = parseInjuryRegions('right ankle, lower back');
    expect(r).toContain('ankle');
    expect(r).toContain('lower_back');
  });

  test('"and" separator', () => {
    const r = parseInjuryRegions('L knee and R shoulder');
    expect(r).toContain('knee');
    expect(r).toContain('shoulder');
  });

  test('group alias expands to multiple regions', () => {
    expect(parseInjuryRegions('right arm')).toEqual(['upper_arm', 'elbow', 'forearm']);
    expect(parseInjuryRegions('whole back')).toEqual(['upper_back', 'mid_back', 'lower_back']);
  });

  test('unmatched text returns other', () => {
    expect(parseInjuryRegions('feeling great')).toEqual(['other']);
  });
});

describe('regionLabel', () => {
  test('humanizes underscore keys', () => {
    expect(regionLabel('lower_back')).toBe('Lower Back');
    expect(regionLabel('upper_arm')).toBe('Upper Arm');
    expect(regionLabel('knee')).toBe('Knee');
    expect(regionLabel('other')).toBe('Other');
  });
});
