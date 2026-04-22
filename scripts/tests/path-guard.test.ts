import { describe, it, expect } from 'vitest';
import { assertSafeReflectDbPath } from '../path-guard';

describe('assertSafeReflectDbPath', () => {
  it('accepts /tmp paths', () => {
    expect(() => assertSafeReflectDbPath('/tmp/reflect-prod.db')).not.toThrow();
  });

  it('rejects paths containing reflect/data/', () => {
    expect(() =>
      assertSafeReflectDbPath('/Users/rlobo/…/reflect/data/sms_logging.db'),
    ).toThrow(/refusing/i);
  });

  it('rejects paths containing reflect\\\\data\\\\ (Windows-style)', () => {
    expect(() =>
      assertSafeReflectDbPath('C:\\\\…\\\\reflect\\\\data\\\\sms_logging.db'),
    ).toThrow(/refusing/i);
  });
});
