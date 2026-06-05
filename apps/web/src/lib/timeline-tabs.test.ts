import { describe, it, expect } from 'vitest';
import { pointLabel, defaultTab } from './timeline-tabs';

describe('pointLabel', () => {
  const scoring = { swim: 2, workout: 1, rehab: 0.6 };

  it('formats a multi-point kind as "Npts"', () => {
    expect(pointLabel('swim', scoring)).toBe('2pts');
  });

  it('formats a one-point kind as "1pt" (singular)', () => {
    expect(pointLabel('workout', scoring)).toBe('1pt');
  });

  it('formats a fractional kind', () => {
    expect(pointLabel('rehab', scoring)).toBe('0.6pts');
  });

  it('is case-insensitive on the kind', () => {
    expect(pointLabel('SWIM', scoring)).toBe('2pts');
  });

  it('returns null when the kind is not in the scoring map', () => {
    expect(pointLabel('yoga', scoring)).toBeNull();
  });

  it('returns null when scoring is undefined', () => {
    expect(pointLabel('swim', undefined)).toBeNull();
  });

  it('returns null when activityKind is null', () => {
    expect(pointLabel(null, scoring)).toBeNull();
  });
});

describe('defaultTab', () => {
  it('picks competition when active competition has entries', () => {
    expect(defaultTab({ hasActiveCompetition: true, competitionCount: 3, surveyCount: 5, messageCount: 9 })).toBe('competition');
  });

  it('falls to surveys when no active competition but surveys exist', () => {
    expect(defaultTab({ hasActiveCompetition: false, competitionCount: 4, surveyCount: 2, messageCount: 9 })).toBe('surveys');
  });

  it('falls to competition when active competition is over but past inputs exist and no surveys', () => {
    expect(defaultTab({ hasActiveCompetition: false, competitionCount: 4, surveyCount: 0, messageCount: 9 })).toBe('competition');
  });

  it('falls to messages when only messages have entries', () => {
    expect(defaultTab({ hasActiveCompetition: false, competitionCount: 0, surveyCount: 0, messageCount: 9 })).toBe('messages');
  });

  it('lands on competition when everything is empty', () => {
    expect(defaultTab({ hasActiveCompetition: false, competitionCount: 0, surveyCount: 0, messageCount: 0 })).toBe('competition');
  });

  it('prefers surveys over an active-but-empty competition', () => {
    expect(defaultTab({ hasActiveCompetition: true, competitionCount: 0, surveyCount: 3, messageCount: 0 })).toBe('surveys');
  });
});
