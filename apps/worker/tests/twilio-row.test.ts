import { describe, it, expect } from 'vitest';
import { toRow, pickTeam, normalizePhone } from '../src/twilio-row';
import { PhoneCache, type PlayerRef } from '../src/phone-cache';

// Accepts a single ref or a list per phone (a multi-team athlete has one
// ref per team). Singles are wrapped so existing single-team tests read
// naturally.
function fakeCache(map: Record<string, PlayerRef | PlayerRef[]>) {
  const listMap = new Map<string, PlayerRef[]>(
    Object.entries(map).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]),
  );
  return new PhoneCache(async () => listMap, 60_000);
}

const noTeamNumbers = new Map<number, string>();

const sample = {
  sid: 'SM123',
  direction: 'inbound' as const,
  from: '+15551234567',
  to: '+15557654321',
  body: 'workout: 5k',
  status: 'received',
  dateSent: new Date('2026-04-21T12:00:00Z'),
};

describe('toRow', () => {
  it('maps inbound message with known sender', async () => {
    const cache = fakeCache({ '+15551234567': { id: 7, team_id: 1 } });
    const row = await toRow(sample, cache, noTeamNumbers);
    expect(row).toEqual({
      sid: 'SM123',
      direction: 'inbound',
      from_number: '+15551234567',
      to_number: '+15557654321',
      body: 'workout: 5k',
      status: 'received',
      category: 'workout',
      date_sent: '2026-04-21T12:00:00.000Z',
      player_id: 7,
      team_id: 1,
      media_sids: null,
    });
  });

  it('maps unknown sender with null player_id and null team', async () => {
    const cache = fakeCache({});
    const row = await toRow(sample, cache, noTeamNumbers);
    expect(row.player_id).toBeNull();
    expect(row.team_id).toBeNull();
    expect(row.category).toBe('workout');
  });

  it('uses outbound direction correctly', async () => {
    const outbound = { ...sample, direction: 'outbound-api' as const, from: '+15557654321', to: '+15551234567' };
    const cache = fakeCache({ '+15551234567': { id: 7, team_id: 1 } });
    const row = await toRow(outbound, cache, noTeamNumbers);
    expect(row.player_id).toBe(7);
  });

  it('strips whatsapp: prefix when resolving inbound sender', async () => {
    const wa = { ...sample, from: 'whatsapp:+15551234567' };
    const cache = fakeCache({ '+15551234567': { id: 7, team_id: 1 } });
    const row = await toRow(wa, cache, noTeamNumbers);
    expect(row.player_id).toBe(7);
    expect(row.from_number).toBe('whatsapp:+15551234567');
  });

  it('strips sms: prefix when resolving inbound sender', async () => {
    const wa = { ...sample, from: 'sms:+15551234567' };
    const cache = fakeCache({ '+15551234567': { id: 7, team_id: 1 } });
    const row = await toRow(wa, cache, noTeamNumbers);
    expect(row.player_id).toBe(7);
  });

  it('strips whatsapp: prefix on outbound to_number', async () => {
    const wa = {
      ...sample,
      direction: 'outbound-api' as const,
      from: 'whatsapp:+15557654321',
      to: 'whatsapp:+15551234567',
    };
    const cache = fakeCache({ '+15551234567': { id: 7, team_id: 1 } });
    const row = await toRow(wa, cache, noTeamNumbers);
    expect(row.player_id).toBe(7);
  });

  it('routes a multi-team athlete by the team-side Twilio number', async () => {
    // Same phone on team 1 and team 2. The inbound arrived AT team 2's
    // number (sample.to), so it belongs to team 2 / player 9.
    const cache = fakeCache({
      '+15551234567': [{ id: 7, team_id: 1 }, { id: 9, team_id: 2 }],
    });
    const teamNumbers = new Map([[1, '+15550000001'], [2, '+15557654321']]);
    const row = await toRow(sample, cache, teamNumbers);
    expect(row.team_id).toBe(2);
    expect(row.player_id).toBe(9);
  });

  it('falls back to the lowest team_id when nothing disambiguates', async () => {
    const cache = fakeCache({
      '+15551234567': [{ id: 9, team_id: 2 }, { id: 7, team_id: 1 }],
    });
    // No team numbers → tie broken deterministically by lowest team_id.
    const row = await toRow(sample, cache, noTeamNumbers);
    expect(row.team_id).toBe(1);
    expect(row.player_id).toBe(7);
  });
});

describe('pickTeam', () => {
  it('returns null for no candidates', () => {
    expect(pickTeam([], '+1', new Map())).toBeNull();
  });
  it('returns the sole candidate without needing a team number', () => {
    expect(pickTeam([{ id: 3, team_id: 5 }], null, new Map())).toEqual({ id: 3, team_id: 5 });
  });
  it('prefers the candidate whose team owns the team-side number', () => {
    const picked = pickTeam(
      [{ id: 1, team_id: 1 }, { id: 2, team_id: 2 }],
      '+1999',
      new Map([[2, '+1999']]),
    );
    expect(picked).toEqual({ id: 2, team_id: 2 });
  });
});

describe('normalizePhone', () => {
  it('returns null for null/undefined', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
  it('returns the input unchanged when no prefix', () => {
    expect(normalizePhone('+15551234567')).toBe('+15551234567');
  });
  it('strips whatsapp: prefix', () => {
    expect(normalizePhone('whatsapp:+15551234567')).toBe('+15551234567');
  });
  it('strips sms: prefix', () => {
    expect(normalizePhone('sms:+15551234567')).toBe('+15551234567');
  });
  it('is case-insensitive on prefix', () => {
    expect(normalizePhone('WhatsApp:+15551234567')).toBe('+15551234567');
  });
});
