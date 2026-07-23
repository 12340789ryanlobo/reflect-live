import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhoneCache } from '../src/phone-cache';

describe('PhoneCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('calls loader once within TTL', async () => {
    const loader = vi.fn(async () => new Map([['+1555', [{ id: 1, team_id: 1 }]]]));
    const cache = new PhoneCache(loader, 300_000);
    expect(await cache.lookupAll('+1555')).toEqual([{ id: 1, team_id: 1 }]);
    expect(await cache.lookupAll('+1555')).toEqual([{ id: 1, team_id: 1 }]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads after TTL expiry', async () => {
    const loader = vi.fn(async () => new Map([['+1555', [{ id: 1, team_id: 1 }]]]));
    const cache = new PhoneCache(loader, 300_000);
    await cache.lookupAll('+1555');
    vi.advanceTimersByTime(300_001);
    await cache.lookupAll('+1555');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('returns empty array for unknown phone', async () => {
    const loader = vi.fn(async () => new Map([['+1555', [{ id: 1, team_id: 1 }]]]));
    const cache = new PhoneCache(loader, 300_000);
    expect(await cache.lookupAll('+9999')).toEqual([]);
  });

  it('returns all refs for a multi-team phone', async () => {
    const loader = vi.fn(async () => new Map([['+1555', [{ id: 1, team_id: 1 }, { id: 2, team_id: 2 }]]]));
    const cache = new PhoneCache(loader, 300_000);
    expect(await cache.lookupAll('+1555')).toEqual([{ id: 1, team_id: 1 }, { id: 2, team_id: 2 }]);
  });
});
