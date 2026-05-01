// Player summary builder. Pulls the everything-the-hero-shows for a
// player — session responses, session flags, SMS surveys/chat, activity
// logs (workouts + rehabs), and injury reports — formats a compact data
// block, and asks the LLM for a structured object. Falls back to a
// deterministic rules-based summary when the LLM is disabled or errors.
//
// Why all five sources: the team's primary check-in flow is SMS via
// Twilio, not the newer sessions tables. Feeding only `responses` left
// the LLM blind to actual readiness numbers, workout volume, and active
// injuries — exactly the data the page already shows the coach.

import { createHash } from 'node:crypto';
import { callJsonPrompt, getLlmConfig } from './llm-client';
import { periodKey, periodLabel, periodPhrase, type Period } from './period';

export type { Period };

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

export interface ActivityLogRow {
  kind: 'workout' | 'rehab';
  description: string;
  logged_at: string;
  hidden?: boolean;
}

export interface InjuryRow {
  regions: string[];
  severity: number | null;
  description: string;
  reported_at: string;
  resolved_at: string | null;
}

export interface TwilioMessageRow {
  direction: string;
  category: string;
  body: string | null;
  date_sent: string;
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

export interface SummaryInputs {
  playerName: string;
  responses: ResponseRow[];
  flags: FlagRow[];
  days: Period;
  activityLogs?: ActivityLogRow[];
  injuries?: InjuryRow[];
  messages?: TwilioMessageRow[];
}

export function generateCacheKey(playerId: number, days: Period, dataHash: string): string {
  const raw = `player:${playerId}:days:${periodKey(days)}:data:${dataHash}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function hashSummaryInputs(
  responses: ResponseRow[],
  flags: FlagRow[],
  activityLogs: ActivityLogRow[] = [],
  injuries: InjuryRow[] = [],
  messages: TwilioMessageRow[] = [],
): string {
  const obj = {
    responses: responses.slice(0, 20).map((r) => ({ q: r.question_id, a: r.answer_num })),
    flags: flags.slice(0, 10).map((f) => ({ t: f.flag_type, s: f.severity })),
    logs: activityLogs.slice(0, 30).map((l) => ({ k: l.kind, d: l.description, t: l.logged_at })),
    injuries: injuries.slice(0, 20).map((i) => ({ r: i.regions, s: i.severity, x: i.resolved_at })),
    msgs: messages
      .filter((m) => m.direction === 'inbound')
      .slice(0, 30)
      .map((m) => ({ c: m.category, b: m.body?.slice(0, 60), t: m.date_sent })),
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

// Mirror the hero's own parser: first 1-2 digits of an inbound survey
// body, clamped to 1-10. Same logic that drives the readiness bar so the
// LLM and the visible average can never disagree.
function smsReadiness(messages: TwilioMessageRow[]): number[] {
  const out: number[] = [];
  for (const m of messages) {
    if (m.direction !== 'inbound' || m.category !== 'survey' || !m.body) continue;
    const match = /^(\d{1,2})/.exec(m.body.trim());
    if (!match) continue;
    const n = Number(match[1]);
    if (n >= 1 && n <= 10) out.push(n);
  }
  return out;
}

function buildPrompt(args: Required<Omit<SummaryInputs, 'days'>> & { days: Period }): string {
  const { playerName, responses, flags, days, activityLogs, injuries, messages } = args;

  const numFor = (q: string) =>
    responses.filter((r) => r.question_id === q && r.answer_num != null).map((r) => r.answer_num as number);
  const rawFor = (q: string) =>
    responses.filter((r) => r.question_id === q && r.answer_raw).map((r) => r.answer_raw as string);

  const sessionReadiness = numFor('q1_readiness');
  const energy = numFor('q4_team_energy');
  const effort = numFor('q5_team_effort');
  const sessionInjuries = responses.filter((r) => r.question_id === 'q2_injury' && r.answer_num === 1);
  const injuryLocations = rawFor('q3_injury_location');
  const focusAreas = uniq([...rawFor('q7_next_focus'), ...rawFor('q7_match_focus')]);
  const matchReflections = rawFor('q5_match_reflection');
  const sessionCount = uniq(responses.map((r) => r.session_id)).length;

  const smsReadings = smsReadiness(messages);
  const visibleLogs = activityLogs.filter((l) => !l.hidden);
  const workouts = visibleLogs.filter((l) => l.kind === 'workout');
  const rehabs = visibleLogs.filter((l) => l.kind === 'rehab');
  const recentWorkouts = workouts
    .slice()
    .sort((a, b) => b.logged_at.localeCompare(a.logged_at))
    .slice(0, 8)
    .map((l) => `${l.logged_at.slice(0, 10)}: ${l.description.slice(0, 100)}`);
  const recentRehabs = rehabs
    .slice()
    .sort((a, b) => b.logged_at.localeCompare(a.logged_at))
    .slice(0, 5)
    .map((l) => `${l.logged_at.slice(0, 10)}: ${l.description.slice(0, 100)}`);

  const openInjuries = injuries.filter((i) => !i.resolved_at);
  const openInjuryLines = openInjuries.slice(0, 8).map((i) => {
    const sev = i.severity != null ? `severity ${i.severity}/10` : 'severity unknown';
    const reportedDay = i.reported_at.slice(0, 10);
    const desc = i.description ? ` — ${i.description.slice(0, 100)}` : '';
    return `${reportedDay} [${i.regions.join(', ') || 'unspecified'}] ${sev}${desc}`;
  });
  const resolvedInPeriod = injuries.filter((i) => i.resolved_at).length;

  const inbound = messages.filter((m) => m.direction === 'inbound');
  const lastInbound = inbound[0]?.date_sent ?? null;
  const chatSnippets = inbound
    .filter((m) => m.category === 'chat' && m.body)
    .slice(0, 4)
    .map((m) => `${m.date_sent.slice(0, 10)}: ${m.body!.slice(0, 100)}`);
  // When no readiness number was parseable, give the LLM raw inbound
  // bodies anyway so it can still extract context (qualitative cues,
  // missed-survey patterns, off-topic chatter, etc).
  const rawInboundSamples = inbound
    .filter((m) => m.body)
    .slice(0, 8)
    .map((m) => `${m.date_sent.slice(0, 10)} [${m.category}]: ${m.body!.slice(0, 120)}`);

  // Split workouts into recent vs earlier so the LLM can call out
  // direction with magnitude rather than just averaging the whole window.
  const half = Math.max(1, Math.floor(workouts.length / 2));
  const recentHalfCount = workouts.slice(0, half).length;
  const earlierHalfCount = workouts.slice(half).length;
  const smsHalf = Math.max(1, Math.floor(smsReadings.length / 2));
  const recentSmsAvg = smsReadings.slice(0, smsHalf);
  const earlierSmsAvg = smsReadings.slice(smsHalf);

  const dataSummary = `
Player: ${playerName}
Period: ${periodLabel(days)}

== CHECK-INS ==
SMS survey readiness (1-10), most recent first: ${smsReadings.length ? JSON.stringify(smsReadings.slice(0, 10)) : 'No data'}
Avg SMS readiness: ${avg(smsReadings)}
Recent half avg readiness: ${avg(recentSmsAvg)}  (${recentSmsAvg.length} readings)
Earlier half avg readiness: ${avg(earlierSmsAvg)}  (${earlierSmsAvg.length} readings)
Inbound SMS count: ${inbound.length}
Last inbound: ${lastInbound ?? 'never'}
${chatSnippets.length ? `Recent chat snippets: ${JSON.stringify(chatSnippets)}` : ''}
${rawInboundSamples.length && smsReadings.length === 0 ? `Sample inbound message bodies (no readiness numbers parseable):\n${rawInboundSamples.map((s) => `  - ${s}`).join('\n')}` : ''}

Session check-ins (legacy tables): ${sessionCount}
${sessionReadiness.length ? `Session readiness scores: ${JSON.stringify(sessionReadiness.slice(-10))} (avg ${avg(sessionReadiness)})` : ''}
${energy.length ? `Energy scores: ${JSON.stringify(energy.slice(-10))} (avg ${avg(energy)})` : ''}
${effort.length ? `Effort scores: ${JSON.stringify(effort.slice(-10))} (avg ${avg(effort)})` : ''}
${focusAreas.length ? `Recent focus areas: ${JSON.stringify(focusAreas.slice(0, 3))}` : ''}
${matchReflections.length ? `Match reflections: ${JSON.stringify(matchReflections.slice(0, 3))}` : ''}

== ACTIVITY ==
Workouts logged: ${workouts.length}
Rehabs logged: ${rehabs.length}
Workout pacing: ${recentHalfCount} in recent half vs ${earlierHalfCount} in earlier half (direction = ${recentHalfCount > earlierHalfCount ? 'rising' : recentHalfCount < earlierHalfCount ? 'falling' : 'flat'})
${recentWorkouts.length ? `Recent workouts:\n${recentWorkouts.map((w) => `  - ${w}`).join('\n')}` : 'No workouts logged this period.'}
${recentRehabs.length ? `Recent rehabs:\n${recentRehabs.map((r) => `  - ${r}`).join('\n')}` : ''}

== INJURIES ==
Open injuries: ${openInjuries.length}${openInjuries.length ? `\n${openInjuryLines.map((l) => `  - ${l}`).join('\n')}` : ''}
Injuries resolved this period: ${resolvedInPeriod}
${sessionInjuries.length ? `Session-reported injury flags: ${sessionInjuries.length}` : ''}
${injuryLocations.length ? `Session injury locations: ${JSON.stringify(injuryLocations.slice(0, 5))}` : ''}

== FLAGS ==
Flags triggered: ${flags.length}
Flag types: ${JSON.stringify(flags.slice(0, 5).map((f) => f.flag_type))}
`;

  return `You are a demanding, data-driven coaching analyst writing a coach-facing
brief. The coach already sees workout count, readiness average, and open
injury count as numbers on the page — DO NOT just restate those. Your job
is the *analysis* layer: patterns, trends, anomalies, what to do next.

RULES:
1. Lead the summary with the single highest-priority finding for the
   coach. Open injuries > readiness drop > load anomaly > engagement gap.
2. Cite specific numbers in EVERY observation. "Workouts dropped from
   8/wk to 3/wk" beats "workout volume declined."
3. Trend, don't average: when SMS readiness is split into recent vs
   earlier halves, name the direction with magnitude (e.g., "readiness
   slipped from 7.2 to 5.4"). Same for workout pacing.
4. Look at workout DESCRIPTIONS, not just counts. Call out muscle-group
   imbalance ("4 leg sessions, 0 upper body") or repetition patterns.
5. If readiness data is missing but inbound SMS exist, read the sample
   bodies and infer mood/engagement from the qualitative text. Don't
   just say "no readiness data" — that's not analysis.
6. Open injuries: name regions, severity, and days-since-reported.
7. No hedging ("might want to", "consider"). Imperative voice.
8. If data is genuinely thin (< 3 of everything), say
   "Insufficient data for trend analysis" briefly — don't pad.

DATA:
${dataSummary}

Respond in JSON. Aim for substance, not length — but don't compress so
hard that the coach learns nothing they didn't already see on the page:
{
    "summary": "3-5 sentences. Lead with the most important finding for the coach. Then explain trend, then the WHY (what the data suggests), not just the WHAT.",
    "observations": ["data-backed observation with specific numbers and trend direction", "...", "...", "..." — exactly 3 to 5 items],
    "recommendations": ["imperative action with reasoning", "...", "..." — exactly 2 to 4 items],
    "confidence": "low|medium|high"
}`;
}

function extractCitations(
  responses: ResponseRow[],
  activityLogs: ActivityLogRow[],
  injuries: InjuryRow[],
): string[] {
  const dates = uniq([
    ...responses.map((r) => (r.created_at ? r.created_at.slice(0, 10) : '')),
    ...activityLogs.map((l) => l.logged_at.slice(0, 10)),
    ...injuries.map((i) => i.reported_at.slice(0, 10)),
  ]).filter(Boolean);
  return dates.slice(0, 5);
}

export function rulesBasedSummary(args: SummaryInputs): SummaryResult {
  const {
    playerName,
    responses,
    flags,
    days,
    activityLogs = [],
    injuries = [],
    messages = [],
  } = args;

  const sessionReadiness = responses
    .filter((r) => r.question_id === 'q1_readiness' && r.answer_num != null)
    .map((r) => r.answer_num as number);
  const energy = responses
    .filter((r) => r.question_id === 'q4_team_energy' && r.answer_num != null)
    .map((r) => r.answer_num as number);
  const sessionInjuries = responses.filter((r) => r.question_id === 'q2_injury' && r.answer_num === 1).length;
  const sessions = uniq(responses.map((r) => r.session_id)).length;

  const smsReadings = smsReadiness(messages);
  const visibleLogs = activityLogs.filter((l) => !l.hidden);
  const workouts = visibleLogs.filter((l) => l.kind === 'workout').length;
  const rehabs = visibleLogs.filter((l) => l.kind === 'rehab').length;
  const openInjuries = injuries.filter((i) => !i.resolved_at);

  // SMS is the team's primary check-in stream — prefer it when available,
  // fall back to session readings only when there's no SMS data at all.
  const readiness = smsReadings.length ? smsReadings : sessionReadiness;
  const checkinCount = smsReadings.length || sessions;
  const totalInjurySignals = openInjuries.length + sessionInjuries;

  const avgReadiness = readiness.length ? readiness.reduce((a, b) => a + b, 0) / readiness.length : null;
  const avgEnergy = energy.length ? energy.reduce((a, b) => a + b, 0) / energy.length : null;

  let summary: string;
  const observations: string[] = [];
  const recommendations: string[] = [];

  const noActivity = checkinCount === 0 && workouts === 0 && rehabs === 0 && openInjuries.length === 0;

  if (noActivity) {
    summary =
      days === 'all'
        ? `No check-in or activity data on record for ${playerName}.`
        : `No check-in or activity data available for ${playerName} ${periodPhrase(days)}.`;
    observations.push('No recent responses recorded');
    recommendations.push('Consider following up to ensure player is completing check-ins');
  } else {
    const parts: string[] = [];
    if (checkinCount > 0) parts.push(`${playerName} completed ${checkinCount} check-in(s) ${periodPhrase(days)}.`);
    else parts.push(`${playerName} has no check-ins ${periodPhrase(days)}.`);
    if (workouts > 0 || rehabs > 0) {
      const bits: string[] = [];
      if (workouts > 0) bits.push(`${workouts} workout${workouts === 1 ? '' : 's'}`);
      if (rehabs > 0) bits.push(`${rehabs} rehab${rehabs === 1 ? '' : 's'}`);
      parts.push(`Logged ${bits.join(' and ')}.`);
    }
    if (avgReadiness != null) parts.push(`Average readiness: ${avgReadiness.toFixed(1)}/10.`);
    if (totalInjurySignals > 0) parts.push(`${openInjuries.length} open injury concern(s).`);
    summary = parts.join(' ');

    if (avgReadiness != null && avgReadiness < 5) observations.push(`Below-average readiness (${avgReadiness.toFixed(1)}/10)`);
    else if (avgReadiness != null && avgReadiness >= 7) observations.push(`Good readiness levels (${avgReadiness.toFixed(1)}/10)`);
    if (avgEnergy != null && avgEnergy < 5) observations.push(`Low energy reports (${avgEnergy.toFixed(1)}/10)`);
    if (openInjuries.length > 0) {
      const regions = uniq(openInjuries.flatMap((i) => i.regions)).slice(0, 3);
      observations.push(`${openInjuries.length} open injury concern(s)${regions.length ? ` (${regions.join(', ')})` : ''}`);
    } else if (sessionInjuries > 0) {
      observations.push(`${sessionInjuries} session-reported injury flag(s)`);
    }
    if (workouts === 0 && checkinCount > 0) observations.push('No workouts logged this period');
    const highFlags = flags.filter((f) => f.severity === 'high');
    if (highFlags.length > 0) observations.push(`${highFlags.length} high-priority alert(s)`);
    if (observations.length === 0) observations.push('No significant concerns noted');

    if (totalInjurySignals > 0) recommendations.push('Check in with trainer about reported injuries');
    if (avgReadiness != null && avgReadiness < 5) recommendations.push('Monitor readiness; recovery focus may help');
    if (highFlags.length > 0) recommendations.push('Review high-priority flags for follow-up');
    if (workouts === 0 && checkinCount > 0 && totalInjurySignals === 0) {
      recommendations.push('Encourage workout logging to track training volume');
    }
    if (recommendations.length === 0) recommendations.push('Continue regular monitoring');
  }

  const signalStrength = checkinCount + workouts + rehabs + openInjuries.length;
  return {
    summary,
    observations,
    recommendations,
    citations: extractCitations(responses, activityLogs, injuries),
    generated_by: 'rules',
    confidence: signalStrength >= 3 ? 'high' : signalStrength > 0 ? 'medium' : 'low',
    from_cache: false,
  };
}

export async function generatePlayerSummary(args: SummaryInputs): Promise<SummaryResult> {
  const cfg = getLlmConfig();
  if (!cfg.enabled || !cfg.apiKey) return rulesBasedSummary(args);

  const filled = {
    playerName: args.playerName,
    responses: args.responses,
    flags: args.flags,
    days: args.days,
    activityLogs: args.activityLogs ?? [],
    injuries: args.injuries ?? [],
    messages: args.messages ?? [],
  };

  try {
    const parsed = await callJsonPrompt(buildPrompt(filled), cfg);
    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const observations = Array.isArray(parsed.observations) ? parsed.observations.filter((x): x is string => typeof x === 'string') : [];
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((x): x is string => typeof x === 'string') : [];
    const confidence: SummaryResult['confidence'] =
      parsed.confidence === 'low' || parsed.confidence === 'high' ? parsed.confidence : 'medium';
    return {
      summary,
      observations: observations.slice(0, 5),
      recommendations: recommendations.slice(0, 4),
      citations: extractCitations(filled.responses, filled.activityLogs, filled.injuries),
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
