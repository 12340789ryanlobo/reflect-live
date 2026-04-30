import { describe, it, expect } from 'vitest';
import {
  periodKey,
  periodLabel,
  periodShortLabel,
  periodPhrase,
  periodSinceIso,
  parsePeriod,
} from './period';

describe('period helpers', () => {
  it('periodKey distinguishes "all" from numeric values', () => {
    expect(periodKey(7)).toBe('7');
    expect(periodKey(14)).toBe('14');
    expect(periodKey('all')).toBe('all');
  });

  it('periodLabel reads naturally', () => {
    expect(periodLabel(7)).toBe('Last 7 days');
    expect(periodLabel('all')).toBe('All-time');
  });

  it('periodShortLabel is button-friendly', () => {
    expect(periodShortLabel(14)).toBe('14d');
    expect(periodShortLabel('all')).toBe('All');
  });

  it('periodPhrase is sentence-fragment-friendly', () => {
    expect(periodPhrase(30)).toBe('in the last 30 days');
    expect(periodPhrase('all')).toBe('across all recorded data');
  });

  it('periodSinceIso returns null for all-time', () => {
    expect(periodSinceIso('all')).toBeNull();
  });

  it('periodSinceIso returns a cutoff N days before "now"', () => {
    const now = new Date('2026-04-29T12:00:00Z');
    const iso = periodSinceIso(7, now);
    expect(iso).toBe('2026-04-22T12:00:00.000Z');
  });
});

describe('parsePeriod', () => {
  it('accepts the literal "all"', () => {
    expect(parsePeriod('all')).toBe('all');
  });

  it('accepts integers in (0, 365]', () => {
    expect(parsePeriod('7')).toBe(7);
    expect(parsePeriod('14')).toBe(14);
    expect(parsePeriod('365')).toBe(365);
  });

  it('falls back on garbage', () => {
    expect(parsePeriod(null)).toBe(14);
    expect(parsePeriod(undefined)).toBe(14);
    expect(parsePeriod('')).toBe(14);
    expect(parsePeriod('abc')).toBe(14);
    expect(parsePeriod('-5')).toBe(14);
    expect(parsePeriod('0')).toBe(14);
    expect(parsePeriod('400')).toBe(14);
    expect(parsePeriod('14.5')).toBe(14);
  });

  it('respects an explicit fallback', () => {
    expect(parsePeriod('garbage', 'all')).toBe('all');
    expect(parsePeriod(null, 30)).toBe(30);
  });
});
