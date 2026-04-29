// Survey YAML loader. The shared package ships `survey_v0.yaml` next to
// package.json so both worker and web bundles can import it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { load } from 'js-yaml';

import type { SurveyConfig, SurveyQuestion } from './types.js';
import { normalizeQuestions } from './flow.js';

let cached: SurveyConfig | null = null;

function defaultYamlPath(): string {
  // packages/shared/src/survey/config.ts → packages/shared/survey_v0.yaml
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'survey_v0.yaml');
}

export function loadSurveyConfig(path?: string): SurveyConfig {
  if (cached && !path) return cached;
  const yamlPath = path ?? defaultYamlPath();
  const raw = readFileSync(yamlPath, 'utf-8');
  const parsed = load(raw) as Partial<SurveyConfig> & { questions?: unknown };
  const config: SurveyConfig = {
    version: parsed.version ?? 'v0',
    name: parsed.name ?? 'Survey',
    estimated_time_minutes: parsed.estimated_time_minutes,
    questions: normalizeQuestions(parsed.questions),
    completion_messages: parsed.completion_messages,
    completion_message: parsed.completion_message,
    error_messages: parsed.error_messages,
  };
  if (!path) cached = config;
  return config;
}

export function getCompletionMessage(config: SurveyConfig): string {
  const list = config.completion_messages;
  if (Array.isArray(list) && list.length) {
    return list[Math.floor(Math.random() * list.length)];
  }
  return config.completion_message ?? 'Thanks! Your responses have been recorded.';
}

export function getErrorMessage(config: SurveyConfig, key: string): string {
  return config.error_messages?.[key] ?? 'Invalid response. Please try again.';
}

/**
 * Pool the YAML questions by session_type and (optionally) team_code, returned
 * as a fresh normalized list. Used when freezing the question snapshot for a
 * brand-new session with no template attached.
 */
export function poolForSession(
  config: SurveyConfig,
  sessionType: string,
  teamCode: string | null,
): SurveyQuestion[] {
  const out: SurveyQuestion[] = [];
  for (const q of config.questions) {
    if (q.session_types && !(q.session_types as string[]).includes(sessionType)) continue;
    if (teamCode !== null && q.team_codes && !q.team_codes.includes(teamCode)) continue;
    out.push(q);
  }
  return normalizeQuestions(out);
}
