import { describe, it, expect } from 'vitest';
import { categorize, extractActivityKind } from '../src/categorize';

describe('categorize', () => {
  it('tags workout-prefixed messages', () => {
    expect(categorize('workout: 5k freestyle')).toBe('workout');
    expect(categorize('Workout done')).toBe('workout');
  });

  it('tags rehab-prefixed messages', () => {
    expect(categorize('rehab: shoulder mobility')).toBe('rehab');
    expect(categorize('REHAB today')).toBe('rehab');
  });

  it('tags modular sport-kind prefixes as workout', () => {
    expect(categorize('swim: hr 30 stations w buckets')).toBe('workout');
    expect(categorize('Lift: clean & jerk 5x3')).toBe('workout');
    expect(categorize('throw: javelin 30 reps')).toBe('workout');
  });

  it('does not match unknown prefixes', () => {
    expect(categorize('foo: whatever this is')).toBe('chat');
    expect(categorize('rugby: practice')).toBe('chat');
  });

  it('tags numeric-leading as survey', () => {
    expect(categorize('8')).toBe('survey');
    expect(categorize('9 tired')).toBe('survey');
    expect(categorize('10, legs feel heavy')).toBe('survey');
  });

  it('falls back to chat', () => {
    expect(categorize('thanks coach')).toBe('chat');
    expect(categorize('')).toBe('chat');
  });
});

describe('extractActivityKind', () => {
  it('returns the specific prefix for known kinds', () => {
    expect(extractActivityKind('swim: hr 30 stations', 'workout')).toBe('swim');
    expect(extractActivityKind('Workout: bike + lift', 'workout')).toBe('workout');
    expect(extractActivityKind('REHAB: shoulder', 'rehab')).toBe('rehab');
    expect(extractActivityKind('lift: 5x3 clean', 'workout')).toBe('lift');
  });

  it('falls back to the category for prefix-less messages', () => {
    expect(extractActivityKind('Workout done today', 'workout')).toBe('workout');
    expect(extractActivityKind('REHAB today', 'rehab')).toBe('rehab');
  });

  it('falls back when prefix is unknown', () => {
    expect(extractActivityKind('rugby: scrum', 'workout')).toBe('workout');
  });
});
