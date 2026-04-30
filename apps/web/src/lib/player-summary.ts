// Player summary builder. Pulls the last-N-day responses + flags for a
// player, formats a data-summary block, and asks the LLM for a structured
// {summary, observations, recommendations, confidence} object. Falls back
// to a deterministic rules-based summary when the LLM is disabled or
// errors out.
//
// Mirrors reflect/app/llm.py's prompt verbatim where possible — same
// rules-first tone, same JSON shape — so the two systems produce
// comparable output during the Phase-6 transition.

import { createHash } from 'node:crypto';
import { callJsonPrompt, getLlmConfig } from './llm-client';

export interface ResponseRow {
  session_id: number;
  question_id: string;
  answer_raw: string | null;
  answer_num: number | null;
  created_at: string;
}

export interface FlagRow {
  flag_type: string;
  severity: string | null;
  details: string | null;
  created_at: string;
}

export interface SummaryResult {
  summary: string;
  observations: string[];
  recommendations: string[];
  citations: string[];
  generated_by: 'llm' | 'rules';
  confidence: 'low' | 'medium' | 'high';
  from_cache: boolean;
  error?: string;
}

export type Period = number | 'all';

function periodKey(p: Period): string {
  return p === 'all' ? 'all' : String(p);
}

function periodLabel(p: Period): string {
  return p === 'all' ? 'All-time' : `Last ${p} days`;
}

function periodPhrase(p: Period): string {
  return p === 'all' ? 'across all recorded check-ins' : `in the last ${p} days`;
}

export function generateCacheKey(playerId: number, days: Period, dataHash: string): string {
  const raw = `player:${playerId}:days:${periodKey(days)}:data:${dataHash}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function hashSummaryInputs(responses: ResponseRow[], flags: FlagRow[]): string {
  const obj = {
    responses: responses.slice(0, 20).map((r) => ({ q: r.question_id, a: r.answer_num })),
    flags: flags.slice(0, 10).map((f) => ({ t: f.flag_type, s: f.severity })),
  };
  return createHash('md5').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

function avg(nums: number[]): string {
  if (nums.length === 0) return 'N/A';
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function buildPrompt(args: {
  playerName: string;
  responses: ResponseRow[];
  flags: FlagRow[];
  days: Period;
}): string {
  const { playerName, responses, flags, days } = args;

  const numFor = (q: string) =>
    responses.filter((r) => r.question_id === q && r.answer_num != null).map((r) => r.answer_num as number);
  const rawFor = (q: string) =>
    responses.filter((r) => r.question_id === q && r.answer_raw).map((r) => r.answer_raw as string);

  const readiness = numFor('q1_readiness');
  const energy = numFor('q4_team_energy');
  const effort = numFor('q5_team_effort');
  const tennis = numFor('q4_individual_tennis');
  const injuries = responses.filter((r) => r.question_id === 'q2_injury' && r.answer_num === 1);
  const injuryLocations = rawFor('q3_injury_location');
  const focusAreas = uniq([...rawFor('q7_next_focus'), ...rawFor('q7_match_focus')]);
  const matchReflections = rawFor('q5_match_reflection');

  const sessionCount = uniq(responses.map((r) => r.session_id)).length;

  const dataSummary = `
Player: ${playerName}
Period: ${periodLabel(days)}
Total Responses: ${sessionCount} sessions

Readiness scores (1-10): ${readiness.length ? JSON.stringify(readiness.slice(-10)) : 'No data'}
Avg readiness: ${avg(readiness)}

Energy scores: ${energy.length ? JSON.stringify(energy.slice(-10)) : 'No data'}
Avg energy: ${avg(energy)}

Effort scores: ${effort.length ? JSON.stringify(effort.slice(-10)) : 'No data'}
Avg effort: ${avg(effort)}

Individual tennis level: ${tennis.length ? JSON.stringify(tennis.slice(-10)) : 'No data'}
Avg tennis level: ${avg(tennis)}

Injury reports: ${injuries.length}
Injury locations mentioned: ${injuryLocations.length ? JSON.stringify(injuryLocations.slice(0, 5)) : 'None'}

Recent focus areas: ${focusAreas.length ? JSON.stringify(focusAreas.slice(0, 3)) : 'None mentioned'}
${matchReflections.length ? `Match reflections: ${JSON.stringify(matchReflections.slice(0, 3))}` : ''}

Flags triggered: ${flags.length}
Flag types: ${JSON.stringify(flags.slice(0, 5).map((f) => f.flag_type))}
`;

  return `You are a demanding, data-driven coaching analyst. No sugarcoating. No filler.
Based ONLY on the data below, produce a blunt, actionable assessment of this player.

RULES:
1. Lead with the most important finding. If the player is hurt, say that first.
2. Every observation MUST cite a specific number from the data.
3. Compare recent performance (last 3-5 sessions) vs earlier sessions. State direction and magnitude.
4. If readiness avg < 5: flag as "Load management required."
5. If injuries > 0: state body regions and say "Trainer evaluation needed."
6. No hedging language ("consider", "might want to"). Say what needs to happen.
7. If data is insufficient (< 3 sessions), say "Insufficient data for trend analysis" and keep it brief.

DATA:
${dataSummary}

Respond in JSON:
{
    "summary": "2-3 sentences. Start with the single most important finding.",
    "observations": ["data-backed observation with specific numbers", ...max 4],
    "recommendations": ["specific action required", ...max 3],
    "confidence": "low|medium|high"
}`;
}

function extractCitations(responses: ResponseRow[]): string[] {
  const dates = uniq(responses.map((r) => (r.created_at ? r.created_at.slice(0, 10) : ''))).filter(Boolean);
  return dates.slice(0, 5);
}

export function rulesBasedSummary(args: {
  playerName: string;
  responses: ResponseRow[];
  flags: FlagRow[];
  days: Period;
}): SummaryResult {
  const { playerName, responses, flags, days } = args;

  const readiness = responses
    .filter((r) => r.question_id === 'q1_readiness' && r.answer_num != null)
    .map((r) => r.answer_num as number);
  const energy = responses
    .filter((r) => r.question_id === 'q4_team_energy' && r.answer_num != null)
    .map((r) => r.answer_num as number);
  const injuries = responses.filter((r) => r.question_id === 'q2_injury' && r.answer_num === 1).length;
  const sessions = uniq(responses.map((r) => r.session_id)).length;

  const avgReadiness = readiness.length ? readiness.reduce((a, b) => a + b, 0) / readiness.length : null;
  const avgEnergy = energy.length ? energy.reduce((a, b) => a + b, 0) / energy.length : null;

  let summary: string;
  const observations: string[] = [];
  const recommendations: string[] = [];

  if (sessions === 0) {
    summary = `No check-in data available for ${playerName} ${periodPhrase(days)}.`;
    observations.push('No recent responses recorded');
    recommendations.push('Consider following up to ensure player is completing check-ins');
  } else {
    const parts = [`${playerName} completed ${sessions} check-in(s) ${periodPhrase(days)}.`];
    if (avgReadiness != null) parts.push(`Average readiness: ${avgReadiness.toFixed(1)}/10.`);
    if (injuries > 0) parts.push(`Reported ${injuries} injury concern(s).`);
    summary = parts.join(' ');

    if (avgReadiness != null && avgReadiness < 5) observations.push(`Below-average readiness (${avgReadiness.toFixed(1)}/10)`);
    else if (avgReadiness != null && avgReadiness >= 7) observations.push(`Good readiness levels (${avgReadiness.toFixed(1)}/10)`);
    if (avgEnergy != null && avgEnergy < 5) observations.push(`Low energy reports (${avgEnergy.toFixed(1)}/10)`);
    if (injuries > 0) observations.push(`${injuries} injury concern(s) reported`);
    const highFlags = flags.filter((f) => f.severity === 'high');
    if (highFlags.length > 0) observations.push(`${highFlags.length} high-priority alert(s)`);
    if (observations.length === 0) observations.push('No significant concerns noted');

    if (injuries > 0) recommendations.push('Check in with trainer about reported injuries');
    if (avgReadiness != null && avgReadiness < 5) recommendations.push('Monitor readiness; recovery focus may help');
    if (highFlags.length > 0) recommendations.push('Review high-priority flags for follow-up');
    if (recommendations.length === 0) recommendations.push('Continue regular monitoring');
  }

  return {
    summary,
    observations,
    recommendations,
    citations: extractCitations(responses),
    generated_by: 'rules',
    confidence: sessions >= 3 ? 'high' : 'low',
    from_cache: false,
  };
}

export async function generatePlayerSummary(args: {
  playerId: number;
  playerName: string;
  responses: ResponseRow[];
  flags: FlagRow[];
  days: Period;
}): Promise<SummaryResult> {
  const cfg = getLlmConfig();
  if (!cfg.enabled || !cfg.apiKey) return rulesBasedSummary(args);

  try {
    const parsed = await callJsonPrompt(buildPrompt(args), cfg);
    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const observations = Array.isArray(parsed.observations) ? parsed.observations.filter((x): x is string => typeof x === 'string') : [];
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((x): x is string => typeof x === 'string') : [];
    const confidence: SummaryResult['confidence'] =
      parsed.confidence === 'low' || parsed.confidence === 'high' ? parsed.confidence : 'medium';
    return {
      summary,
      observations: observations.slice(0, 4),
      recommendations: recommendations.slice(0, 3),
      citations: extractCitations(args.responses),
      generated_by: 'llm',
      confidence,
      from_cache: false,
    };
  } catch (e) {
    const fallback = rulesBasedSummary(args);
    fallback.error = e instanceof Error ? e.message : String(e);
    return fallback;
  }
}
