// Question flow resolution — given a session question list and the
// player/session state, find the next question to ask. Conditional rules
// (depends_on/show_if) and captain-only filtering are applied here.
//
// `getResponse` is injected so this stays pure-ish (no Supabase coupling).

import type { SurveyQuestion } from './types.js';

export type GetResponseFn = (
  sessionId: number,
  playerId: number,
  questionId: string,
) => Promise<number | null | undefined>;

/**
 * Normalize a question list — fill defaults, sort by `order`. Used when
 * loading a snapshot or template's questions_json so downstream callers
 * never see undefined ids/types.
 */
export function normalizeQuestions(qs: unknown): SurveyQuestion[] {
  if (!Array.isArray(qs)) return [];
  const out: SurveyQuestion[] = [];
  qs.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const q = raw as Partial<SurveyQuestion>;
    out.push({
      id: q.id ?? `q_custom_${i + 1}`,
      order: typeof q.order === 'number' ? q.order : i + 1,
      text: q.text ?? q.id ?? '',
      type: (q.type ?? 'free_text') as SurveyQuestion['type'],
      session_types: q.session_types,
      team_codes: q.team_codes,
      captain_only: q.captain_only,
      validation: q.validation ?? {},
      flag_rule: q.flag_rule,
      conditional: q.conditional,
      ack_on_yes: q.ack_on_yes,
    });
  });
  out.sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
  return out;
}

/**
 * Filter the YAML question pool to a session's effective list (by
 * session_type + team_code). Used when no template is set and no snapshot
 * has been frozen yet.
 */
export function filterYamlQuestions(
  pool: SurveyQuestion[],
  sessionType: string,
  teamCode: string | null,
): SurveyQuestion[] {
  const out: SurveyQuestion[] = [];
  for (const q of pool) {
    const types = q.session_types;
    if (types && !(types as string[]).includes(sessionType)) continue;
    if (teamCode !== null) {
      const codes = q.team_codes;
      if (codes && !codes.includes(teamCode)) continue;
    }
    out.push(q);
  }
  return normalizeQuestions(out);
}

/**
 * Locate the question at a given progress pointer. Order-first (matches
 * reflect's snapshot semantics), then array index as fallback.
 */
export function questionAtProgress(
  questions: SurveyQuestion[],
  currentQIdx: number,
): SurveyQuestion | null {
  const targetOrder = currentQIdx + 1;
  for (const q of questions) {
    if (q.order === targetOrder) return q;
  }
  if (currentQIdx >= 0 && currentQIdx < questions.length) {
    return questions[currentQIdx];
  }
  return null;
}

/**
 * Find the next question after the given order, respecting captain_only +
 * conditional (depends_on / show_if). `getResponse` returns the
 * answer_num for a (session_id, player_id, question_id) tuple. Returns
 * null when the survey is complete.
 */
export async function findNextQuestion(
  questions: SurveyQuestion[],
  currentOrder: number,
  sessionId: number,
  playerId: number,
  isCaptain: boolean,
  getResponse: GetResponseFn,
): Promise<SurveyQuestion | null> {
  for (const q of questions) {
    const qOrder = q.order || 0;
    if (qOrder <= currentOrder) continue;

    if (q.captain_only && !isCaptain) continue;

    const cond = q.conditional;
    if (cond?.depends_on) {
      const depValue = await getResponse(sessionId, playerId, cond.depends_on);
      if (depValue === null || depValue === undefined) continue;
      const showIf = (cond.show_if ?? '').trim().toLowerCase();
      if (['yes', '1', 'true', 'value == 1'].includes(showIf) && depValue !== 1) continue;
      if (['no', '0', 'false', 'value == 0'].includes(showIf) && depValue !== 0) continue;
    }

    return q;
  }
  return null;
}
