import { describe, it, expect } from 'vitest';
import { toRow, normalizePhone } from '../src/twilio-row';
import { PhoneCache } from '../src/phone-cache';

function fakeCache(map: Record<string, { id: number; team_id: number }>) {
  return new PhoneCache(async () => new Map(Object.entries(map)), 60_000);
}

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
    const row = await toRow(sample, cache, 1);
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
    });
  });

  it('maps unknown sender with null player_id and default team', async () => {
    const cache = fakeCache({});
    const row = await toRow(sample, cache, 1);
    expect(row.player_id).toBeNull();
    expect(row.team_id).toBe(1);
    expect(row.category).toBe('workout');
  });

  it('uses outbound direction correctly', async () => {
    const outbound = { ...sample, direction: 'outbound-api' as const, from: '+15557654321', to: '+15551234567' };
    const cache = fakeCache({ '+15551234567': { id: 7, team_id: 1 } });
    const row = await toRow(outbound, cache, 1);
    expect(row.player_id).toBe(7);
  });

  it('strips whatsapp: prefix when resolving inbound sender', async () => {
    const wa = { ...sample, from: 'whatsapp:+15551234567' };
    const cache = fakeCache({ '+15551234567': { id: 7, team_id: 1 } });
    const row = await toRow(wa, cache, 1);
    expect(row.player_id).toBe(7);
    expect(row.from_number).toBe('whatsapp:+15551234567');
  });

  it('strips sms: prefix when resolving inbound sender', async () => {
    const wa = { ...sample, from: 'sms:+15551234567' };
    const cache = fakeCache({ '+15551234567': { id: 7, team_id: 1 } });
    const row = await toRow(wa, cache, 1);
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
    const row = await toRow(wa, cache, 1);
    expect(row.player_id).toBe(7);
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
