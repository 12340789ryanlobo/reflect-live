import { describe, it, expect } from 'vitest';
import {
  digitsOnly,
  teamUsesWhatsApp,
  chatHrefForTeamNumber,
  chatHrefForPerson,
} from './chat-link';

describe('digitsOnly', () => {
  it('strips whatsapp: prefix', () => {
    expect(digitsOnly('whatsapp:+13214062958')).toBe('13214062958');
  });
  it('strips sms: prefix', () => {
    expect(digitsOnly('sms:+13214062958')).toBe('13214062958');
  });
  it('strips spaces, dashes, parens', () => {
    expect(digitsOnly('+1 (321) 406-2958')).toBe('13214062958');
  });
  it('returns empty on null/undefined/empty', () => {
    expect(digitsOnly(null)).toBe('');
    expect(digitsOnly(undefined)).toBe('');
    expect(digitsOnly('')).toBe('');
  });
});

describe('teamUsesWhatsApp', () => {
  it('detects whatsapp: prefix', () => {
    expect(teamUsesWhatsApp('whatsapp:+13214062958')).toBe(true);
    expect(teamUsesWhatsApp('WhatsApp:+13214062958')).toBe(true);
  });
  it('rejects plain SMS numbers', () => {
    expect(teamUsesWhatsApp('+13214062958')).toBe(false);
    expect(teamUsesWhatsApp(null)).toBe(false);
    expect(teamUsesWhatsApp(undefined)).toBe(false);
  });
});

describe('chatHrefForTeamNumber', () => {
  it('builds wa.me link for whatsapp team', () => {
    expect(chatHrefForTeamNumber('whatsapp:+13214062958')).toBe(
      'https://wa.me/13214062958',
    );
  });
  it('encodes the prefill text', () => {
    expect(chatHrefForTeamNumber('whatsapp:+13214062958', 'Workout: ')).toBe(
      'https://wa.me/13214062958?text=Workout%3A%20',
    );
  });
  it('falls back to sms: for non-whatsapp teams', () => {
    expect(chatHrefForTeamNumber('+13214062958')).toBe('sms:+13214062958');
  });
  it('returns null when number is missing', () => {
    expect(chatHrefForTeamNumber(null)).toBeNull();
    expect(chatHrefForTeamNumber('')).toBeNull();
    expect(chatHrefForTeamNumber('whatsapp:')).toBeNull(); // empty digits
  });
});

describe('chatHrefForPerson', () => {
  it('always uses wa.me regardless of input format', () => {
    expect(chatHrefForPerson('+61452543234')).toBe('https://wa.me/61452543234');
    expect(chatHrefForPerson('whatsapp:+61452543234')).toBe('https://wa.me/61452543234');
  });
  it('returns null on missing phone', () => {
    expect(chatHrefForPerson(null)).toBeNull();
  });
});
