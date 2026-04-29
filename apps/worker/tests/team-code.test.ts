import { describe, it, expect } from 'vitest';
import { generateTeamCode, isValidTeamCode, TEAM_CODE_ALPHABET } from '@reflect-live/shared';

describe('generateTeamCode', () => {
  it('returns a 6-character lowercase string', () => {
    const code = generateTeamCode();
    expect(code).toMatch(/^[a-z2-9]{6}$/);
  });

  it('uses only the safe alphabet (no 0, o, 1, l, i)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateTeamCode();
      for (const ch of code) {
        expect(TEAM_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('produces different codes across calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) codes.add(generateTeamCode());
    expect(codes.size).toBeGreaterThan(15);
  });
});

describe('isValidTeamCode', () => {
  it('accepts a generated code', () => {
    expect(isValidTeamCode(generateTeamCode())).toBe(true);
  });

  it('accepts uppercase + lowercase mix and normalizes by case', () => {
    expect(isValidTeamCode('Abc234')).toBe(true);
  });

  it('rejects ambiguous letters', () => {
    expect(isValidTeamCode('abcdo1')).toBe(false);
    expect(isValidTeamCode('111111')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidTeamCode('abc')).toBe(false);
    expect(isValidTeamCode('abcdefg')).toBe(false);
  });
});
