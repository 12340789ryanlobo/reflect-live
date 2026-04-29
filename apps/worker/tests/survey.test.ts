// Unit tests for the pure survey helpers (parse, validate, flow). The
// SurveyEngine state machine is exercised separately during shadow soak
// against a real Supabase fixture.

import { describe, it, expect } from 'vitest';
import {
  parseScaleResponse,
  parseBodyRegions,
  validateAnswer,
  evaluateFlagRule,
  loadSurveyConfig,
  poolForSession,
  findNextQuestion,
  questionAtProgress,
  normalizeQuestions,
  type SurveyConfig,
  type SurveyQuestion,
} from '@reflect-live/shared';

const config: SurveyConfig = loadSurveyConfig();

describe('parseScaleResponse', () => {
  it('accepts plain integers in range', () => {
    expect(parseScaleResponse('7', 1, 10)).toBe(7);
  });
  it('accepts numbers embedded in text', () => {
    expect(parseScaleResponse('around 7', 1, 10)).toBe(7);
    expect(parseScaleResponse('definitely 9!', 1, 10)).toBe(9);
    expect(parseScaleResponse('8/10', 1, 10)).toBe(8);
  });
  it('rejects out-of-range', () => {
    expect(parseScaleResponse('11', 1, 10)).toBe(null);
    expect(parseScaleResponse('0', 1, 10)).toBe(null);
  });
  it('rejects non-numeric', () => {
    expect(parseScaleResponse('hello', 1, 10)).toBe(null);
    expect(parseScaleResponse('', 1, 10)).toBe(null);
  });
});

describe('parseBodyRegions', () => {
  it('parses comma-separated region/rating pairs', () => {
    expect(parseBodyRegions('left knee 7, right wrist 4')).toEqual([
      ['left knee', 7],
      ['right wrist', 4],
    ]);
  });
  it('returns empty array for none-style answers', () => {
    expect(parseBodyRegions('')).toEqual([]);
  });
});

describe('validateAnswer', () => {
  const scaleQ: SurveyQuestion = {
    id: 'q1', order: 1, text: 'Readiness?', type: 'scale_1_10',
    validation: { min: 1, max: 10, required: true },
  };
  const binaryQ: SurveyQuestion = {
    id: 'q2', order: 2, text: 'Pain?', type: 'binary',
    validation: { required: true },
  };
  const captainQ: SurveyQuestion = {
    id: 'qc', order: 3, text: 'Captain check?', type: 'captain_rating',
    validation: { min: 1, max: 10, max_length: 300, required: true },
  };

  it('validates scale_1_10', () => {
    expect(validateAnswer(scaleQ, '8', config)).toEqual({ ok: true, value: 8, error: null });
    expect(validateAnswer(scaleQ, '11', config).ok).toBe(false);
  });

  it('validates binary y/n/0/1', () => {
    expect(validateAnswer(binaryQ, 'yes', config)).toEqual({ ok: true, value: 1, error: null });
    expect(validateAnswer(binaryQ, '0', config)).toEqual({ ok: true, value: 0, error: null });
    expect(validateAnswer(binaryQ, 'maybe', config).ok).toBe(false);
  });

  it('captain_rating extracts leading number with trailing comment', () => {
    expect(validateAnswer(captainQ, '8 solid practice', config)).toEqual({
      ok: true, value: 8, error: null,
    });
  });

  it('rejects skip when required', () => {
    expect(validateAnswer(scaleQ, 'skip', config).ok).toBe(false);
  });

  it('allows skip when not required', () => {
    const optional: SurveyQuestion = { ...scaleQ, validation: { min: 1, max: 10 } };
    expect(validateAnswer(optional, 'skip', config)).toEqual({ ok: true, value: null, error: null });
  });
});

describe('evaluateFlagRule', () => {
  const lowReadinessQ: SurveyQuestion = {
    id: 'q1', order: 1, text: 'Readiness', type: 'scale_1_10',
    flag_rule: { condition: 'value <= 3', flag_type: 'low_readiness', severity: 'medium' },
  };
  const injuryQ: SurveyQuestion = {
    id: 'q2', order: 2, text: 'Injury?', type: 'binary',
    flag_rule: { condition: 'value == 1', flag_type: 'injury_concern', severity: 'high' },
  };

  it('fires on value <= 3', () => {
    expect(evaluateFlagRule(lowReadinessQ, 2, '2')?.flag_type).toBe('low_readiness');
    expect(evaluateFlagRule(lowReadinessQ, 4, '4')).toBe(null);
  });

  it('fires on value == 1', () => {
    expect(evaluateFlagRule(injuryQ, 1, 'yes')?.severity).toBe('high');
    expect(evaluateFlagRule(injuryQ, 0, 'no')).toBe(null);
  });

  it('does not fire when no rule', () => {
    const plain: SurveyQuestion = { id: 'p', order: 1, text: '', type: 'free_text' };
    expect(evaluateFlagRule(plain, 5, '5')).toBe(null);
  });
});

describe('loadSurveyConfig + poolForSession', () => {
  it('loads the v0 YAML', () => {
    expect(config.questions.length).toBeGreaterThan(0);
    expect(config.error_messages?.invalid_scale).toBeDefined();
  });

  it('filters by session_type and team_code', () => {
    const tennisPractice = poolForSession(config, 'practice', 'uchicago-mens-tennis');
    expect(tennisPractice.length).toBeGreaterThan(0);
    expect(tennisPractice.every((q) => !q.session_types || q.session_types.includes('practice'))).toBe(true);
    expect(tennisPractice.every((q) => !q.team_codes || q.team_codes.includes('uchicago-mens-tennis'))).toBe(true);
  });

  it('respects session-type-only filter when team_code is null', () => {
    const lifting = poolForSession(config, 'lifting', null);
    expect(lifting.length).toBeGreaterThan(0);
    expect(lifting.every((q) => !q.session_types || q.session_types.includes('lifting'))).toBe(true);
  });
});

describe('findNextQuestion', () => {
  it('skips captain-only when player is not captain', async () => {
    const qs = normalizeQuestions([
      { id: 'q1', order: 1, type: 'scale_1_10', text: 'A' },
      { id: 'q2', order: 2, type: 'free_text', text: 'B', captain_only: true },
      { id: 'q3', order: 3, type: 'free_text', text: 'C' },
    ]);
    const next = await findNextQuestion(qs, 1, 1, 1, false, async () => null);
    expect(next?.id).toBe('q3');
  });

  it('honors conditional show_if value == 1', async () => {
    const qs = normalizeQuestions([
      { id: 'q1', order: 1, type: 'binary', text: 'Pain?' },
      {
        id: 'q2', order: 2, type: 'free_text', text: 'Where?',
        conditional: { depends_on: 'q1', show_if: 'value == 1' },
      },
      { id: 'q3', order: 3, type: 'free_text', text: 'After' },
    ]);
    // q1 answered 0 — q2 should be skipped
    const skip = await findNextQuestion(qs, 1, 1, 1, false, async () => 0);
    expect(skip?.id).toBe('q3');
    // q1 answered 1 — q2 is included
    const include = await findNextQuestion(qs, 1, 1, 1, false, async () => 1);
    expect(include?.id).toBe('q2');
  });

  it('returns null when nothing left', async () => {
    const qs = normalizeQuestions([{ id: 'q1', order: 1, type: 'scale_1_10', text: 'A' }]);
    expect(await findNextQuestion(qs, 1, 1, 1, false, async () => null)).toBe(null);
  });
});

describe('questionAtProgress', () => {
  it('finds by order, not array index', () => {
    const qs = normalizeQuestions([
      { id: 'q1', order: 1, type: 'scale_1_10', text: 'A' },
      { id: 'q5', order: 5, type: 'free_text', text: 'B' },
    ]);
    expect(questionAtProgress(qs, 4)?.id).toBe('q5');
    expect(questionAtProgress(qs, 0)?.id).toBe('q1');
  });
});
