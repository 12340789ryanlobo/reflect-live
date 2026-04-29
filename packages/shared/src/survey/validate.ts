// Per-question-type answer validation. Pure: no DB access, no I/O. Returns
// {ok, value, error} where:
//   - ok=true  → value is the numeric form (or null for free_text), error=null
//   - ok=false → value=null, error=string key from config.error_messages
//
// Mirrors reflect/app/survey_engine.py::SurveyEngine._validate_response.

import type { FlagSeverity, FlagType, SurveyConfig, SurveyQuestion } from './types';
import { parseBodyRegions, parseScaleResponse } from './parse';

export type ValidateResult =
  | { ok: true; value: number | null; error: null }
  | { ok: false; value: null; error: string };

function errorFor(config: SurveyConfig, key: string, fallback: string): string {
  return config.error_messages?.[key] ?? fallback;
}

export function validateAnswer(
  question: SurveyQuestion,
  rawAnswer: string,
  config: SurveyConfig,
): ValidateResult {
  const validation = question.validation ?? {};
  const raw = rawAnswer.trim();

  // "skip"/"s" only allowed when not required.
  if (!validation.required && /^(skip|s)$/i.test(raw)) {
    return { ok: true, value: null, error: null };
  }

  switch (question.type) {
    case 'scale_1_10': {
      const min = validation.min ?? 1;
      const max = validation.max ?? 10;
      const v = parseScaleResponse(raw, min, max);
      if (v === null) {
        return { ok: false, value: null, error: errorFor(config, 'invalid_scale', 'Please reply with a number 1-10.') };
      }
      return { ok: true, value: v, error: null };
    }

    case 'binary': {
      const lower = raw.toLowerCase();
      if (['0', 'no', 'n'].includes(lower)) return { ok: true, value: 0, error: null };
      if (['1', 'yes', 'y'].includes(lower)) return { ok: true, value: 1, error: null };
      return { ok: false, value: null, error: errorFor(config, 'invalid_binary', 'Please reply 0 (no) or 1 (yes).') };
    }

    case 'choice_1_3': {
      const min = validation.min ?? 1;
      const max = validation.max ?? 3;
      const v = parseScaleResponse(raw, min, max);
      if (v === null) {
        return { ok: false, value: null, error: errorFor(config, 'invalid_choice', 'Please reply 1, 2, or 3.') };
      }
      return { ok: true, value: v, error: null };
    }

    case 'captain_rating': {
      const min = validation.min ?? 1;
      const max = validation.max ?? 10;
      const maxLen = validation.max_length ?? 300;
      if (raw.length > maxLen) {
        return { ok: false, value: null, error: errorFor(config, 'too_long', 'Too long - keep it brief!') };
      }
      // "8 solid practice" → 8
      const lead = raw.match(/^(\d+)\s*(.*)/);
      if (lead) {
        const n = Number(lead[1]);
        if (Number.isInteger(n) && n >= min && n <= max) {
          return { ok: true, value: n, error: null };
        }
      }
      const v = parseScaleResponse(raw, min, max);
      if (v !== null) return { ok: true, value: v, error: null };
      return { ok: false, value: null, error: errorFor(config, 'invalid_captain_rating', 'Reply with a number 1-10 (optionally followed by a comment).') };
    }

    case 'multi_select_body_regions': {
      const regions = parseBodyRegions(raw);
      if (validation.required && regions.length === 0) {
        if (!/^(none|no|nothing|n\/a)$/i.test(raw)) {
          return { ok: false, value: null, error: "Please specify region(s) and rating(s), or reply 'none'." };
        }
      }
      const maxRating = regions.reduce((m, [, r]) => (r > m ? r : m), 0);
      return { ok: true, value: maxRating, error: null };
    }

    case 'free_text': {
      const maxLen = validation.max_length ?? 800;
      if (raw.length > maxLen) {
        return { ok: false, value: null, error: errorFor(config, 'too_long', 'Too long - keep it brief!') };
      }
      if (validation.required && !raw) {
        return { ok: false, value: null, error: errorFor(config, 'required', 'Please provide an answer.') };
      }
      return { ok: true, value: null, error: null };
    }

    default:
      // Unknown types are permissive (mirrors reflect).
      return { ok: true, value: null, error: null };
  }
}

/**
 * Evaluate a question's flag_rule against the parsed answer. Returns the flag
 * record fields when the rule fires, or null. Pure.
 */
export function evaluateFlagRule(
  question: SurveyQuestion,
  parsedValue: number | null,
  rawAnswer: string,
): { flag_type: FlagType; severity: FlagSeverity; details: string } | null {
  const rule = question.flag_rule;
  if (!rule || parsedValue === null) return null;

  let fires = false;
  switch (rule.condition) {
    case 'value <= 3':       fires = parsedValue <= 3; break;
    case 'value >= 7':       fires = parsedValue >= 7; break;
    case 'any_rating >= 7':  fires = parsedValue >= 7; break;
    case 'value == 1':       fires = parsedValue === 1; break;
    case 'value == 0':       fires = parsedValue === 0; break;
    default:                 fires = false;
  }
  if (!fires) return null;

  return {
    flag_type: rule.flag_type,
    severity: rule.severity ?? 'medium',
    details: `Question: ${question.id}, Answer: ${rawAnswer}`,
  };
}

