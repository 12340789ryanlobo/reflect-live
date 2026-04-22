import { describe, it, expect } from 'vitest';
import { categorize } from '../src/categorize';

describe('categorize', () => {
  it('tags workout-prefixed messages', () => {
    expect(categorize('workout: 5k freestyle')).toBe('workout');
    expect(categorize('Workout done')).toBe('workout');
  });

  it('tags rehab-prefixed messages', () => {
    expect(categorize('rehab: shoulder mobility')).toBe('rehab');
    expect(categorize('REHAB today')).toBe('rehab');
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
