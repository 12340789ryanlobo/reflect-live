// Survey state machine, Supabase-backed. Mirrors reflect's SurveyEngine
// closely so a side-by-side soak diff is straightforward.
//
// Inject a service-role Supabase client (`SupabaseClient`) — we read/write
// sessions, deliveries, responses, flags, players, teams, question_templates.
//
// The engine is split deliberately:
//   - parse.ts / validate.ts / flow.ts are pure
//   - config.ts is YAML-only
//   - this file is the only one that touches the DB

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  DeliveryRow,
  FlagSeverity,
  FlagType,
  SessionMetadata,
  SessionRow,
  SurveyConfig,
  SurveyQuestion,
} from './types';
import {
  getCompletionMessage,
  getErrorMessage,
  loadSurveyConfig,
  poolForSession,
} from './config';
import { evaluateFlagRule, validateAnswer } from './validate';
import {
  findNextQuestion,
  normalizeQuestions,
  questionAtProgress,
} from './flow';

export interface ProcessResponseResult {
  ok: boolean;
  error: string | null;
  next: string | null; // next question text or completion message
}

export class SurveyEngine {
  private readonly sb: SupabaseClient;
  private readonly config: SurveyConfig;

  constructor(sb: SupabaseClient, config?: SurveyConfig) {
    this.sb = sb;
    this.config = config ?? loadSurveyConfig();
  }

  // ---- Snapshot resolution ------------------------------------------------

  /**
   * Get the frozen question list for a session. If no snapshot exists yet,
   * resolve from template_id (if set) or YAML pool, and persist the snapshot
   * to sessions.metadata_json so future calls return the same list.
   */
  async getQuestionsForSession(sessionId: number): Promise<SurveyQuestion[] | null> {
    const { data: session } = await this.sb
      .from('sessions')
      .select('id, type, team_id, template_id, metadata_json')
      .eq('id', sessionId)
      .maybeSingle<Pick<SessionRow, 'id' | 'type' | 'team_id' | 'template_id' | 'metadata_json'>>();
    if (!session) return null;

    const snap = session.metadata_json?.question_snapshot;
    if (snap?.questions?.length) return normalizeQuestions(snap.questions);

    let teamCode: string | null = null;
    if (session.team_id) {
      const { data: team } = await this.sb
        .from('teams')
        .select('code')
        .eq('id', session.team_id)
        .maybeSingle<{ code: string }>();
      teamCode = team?.code ?? null;
    }

    let questions: SurveyQuestion[] | null = null;
    let source: 'yaml' | 'template' = 'yaml';

    if (session.template_id) {
      const { data: tmpl } = await this.sb
        .from('question_templates')
        .select('questions_json')
        .eq('id', session.template_id)
        .maybeSingle<{ questions_json: unknown }>();
      const raw = tmpl?.questions_json;
      if (Array.isArray(raw) && raw.length) {
        questions = normalizeQuestions(raw);
        source = 'template';
      }
    }

    if (!questions || questions.length === 0) {
      questions = poolForSession(this.config, session.type ?? 'practice', teamCode);
    }

    if (questions.length === 0) return null;

    await this.persistSnapshot(session, questions, source, teamCode);
    return questions;
  }

  private async persistSnapshot(
    session: Pick<SessionRow, 'id' | 'type' | 'template_id' | 'metadata_json'>,
    questions: SurveyQuestion[],
    source: 'yaml' | 'template',
    teamCode: string | null,
  ): Promise<void> {
    const metadata: SessionMetadata = { ...(session.metadata_json ?? {}) };
    metadata.question_snapshot = {
      version: 1,
      source,
      template_id: session.template_id,
      session_type: session.type,
      team_code: teamCode,
      captured_at: new Date().toISOString(),
      questions,
    };
    await this.sb.from('sessions').update({ metadata_json: metadata }).eq('id', session.id);
  }

  // ---- Active delivery lookup --------------------------------------------

  /**
   * Find a player's most-recent live delivery (pending or in_progress) for
   * a given phone. When teamId is null (e.g. inbound webhook with no team
   * context), only deliveries from sessions started in the last 48h are
   * eligible — prevents stale rows from hijacking unrelated chats.
   */
  async getActiveDelivery(phoneE164: string, teamId: number | null): Promise<DeliveryRow | null> {
    if (teamId !== null) {
      const { data: player } = await this.sb
        .from('players')
        .select('id')
        .eq('phone_e164', phoneE164)
        .eq('team_id', teamId)
        .eq('active', true)
        .maybeSingle<{ id: number }>();
      if (!player) return null;
      const { data } = await this.sb
        .from('deliveries')
        .select('*')
        .eq('player_id', player.id)
        .in('status', ['pending', 'in_progress'])
        .order('status', { ascending: true })
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle<DeliveryRow>();
      return data ?? null;
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: players } = await this.sb
      .from('players')
      .select('id')
      .eq('phone_e164', phoneE164)
      .eq('active', true);
    const ids = (players ?? []).map((p) => p.id);
    if (ids.length === 0) return null;
    const { data } = await this.sb
      .from('deliveries')
      .select('*')
      .in('player_id', ids)
      .in('status', ['pending', 'in_progress'])
      .gte('started_at', cutoff)
      .order('status', { ascending: true })
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle<DeliveryRow>();
    return data ?? null;
  }

  // ---- Delivery lifecycle ------------------------------------------------

  /**
   * Open a fresh delivery for a player on a session. Marks any other
   * incomplete deliveries on different sessions as `abandoned` so a single
   * inbound text always maps to one live survey.
   */
  async startDelivery(sessionId: number, playerId: number): Promise<number | null> {
    const { data: session } = await this.sb
      .from('sessions')
      .select('type')
      .eq('id', sessionId)
      .maybeSingle<{ type: SessionRow['type'] }>();
    const sessionType = session?.type ?? 'practice';

    await this.sb
      .from('deliveries')
      .update({ status: 'abandoned' })
      .eq('player_id', playerId)
      .in('status', ['pending', 'in_progress'])
      .neq('session_id', sessionId);

    const { data: existing } = await this.sb
      .from('deliveries')
      .select('id')
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
      .maybeSingle<{ id: number }>();

    const now = new Date().toISOString();
    if (existing) {
      await this.sb
        .from('deliveries')
        .update({
          status: 'in_progress',
          started_at: now,
          current_q_idx: 0,
          session_type: sessionType,
        })
        .eq('id', existing.id);
      return existing.id;
    }

    const { data: ins } = await this.sb
      .from('deliveries')
      .insert({
        session_id: sessionId,
        player_id: playerId,
        status: 'in_progress',
        started_at: now,
        current_q_idx: 0,
        session_type: sessionType,
      })
      .select('id')
      .maybeSingle<{ id: number }>();
    return ins?.id ?? null;
  }

  // ---- Inbound response processing ---------------------------------------

  async processResponse(
    deliveryId: number,
    playerId: number,
    rawAnswer: string,
  ): Promise<ProcessResponseResult> {
    const { data: delivery } = await this.sb
      .from('deliveries')
      .select('*')
      .eq('id', deliveryId)
      .maybeSingle<DeliveryRow>();
    if (!delivery) return { ok: false, error: 'Delivery not found.', next: null };

    const sessionId = delivery.session_id;
    const currentQIdx = delivery.current_q_idx;

    const { data: player } = await this.sb
      .from('players')
      .select('is_captain')
      .eq('id', playerId)
      .maybeSingle<{ is_captain: boolean | null }>();
    const isCaptain = !!player?.is_captain;

    const sessionQs = await this.getQuestionsForSession(sessionId);
    if (!sessionQs) return { ok: false, error: 'Question not found.', next: null };

    const question = questionAtProgress(sessionQs, currentQIdx);
    if (!question) return { ok: false, error: 'Question not found.', next: null };

    const v = validateAnswer(question, rawAnswer, this.config);
    if (!v.ok) {
      return { ok: false, error: v.error ?? getErrorMessage(this.config, 'invalid_format'), next: null };
    }

    await this.sb.from('responses').insert({
      session_id: sessionId,
      player_id: playerId,
      question_id: question.id,
      answer_raw: rawAnswer,
      answer_num: v.value,
    });

    const flag = evaluateFlagRule(question, v.value, rawAnswer);
    if (flag) await this.sb.from('flags').insert({ session_id: sessionId, player_id: playerId, ...flag });

    const ackPrefix = question.ack_on_yes && v.value === 1 ? `${question.ack_on_yes}\n\n` : '';

    const next = await findNextQuestion(
      sessionQs,
      question.order ?? currentQIdx + 1,
      sessionId,
      playerId,
      isCaptain,
      async (sid, pid, qid) => {
        const { data } = await this.sb
          .from('responses')
          .select('answer_num')
          .eq('session_id', sid)
          .eq('player_id', pid)
          .eq('question_id', qid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ answer_num: number | null }>();
        return data?.answer_num ?? null;
      },
    );

    if (next) {
      const newIdx = (next.order ?? currentQIdx + 2) - 1;
      await this.sb.from('deliveries').update({ current_q_idx: newIdx }).eq('id', deliveryId);
      let text = next.text;
      if (currentQIdx === 0) {
        const { data: s } = await this.sb
          .from('sessions')
          .select('label')
          .eq('id', sessionId)
          .maybeSingle<{ label: string }>();
        if (s?.label) text = `[${s.label}]\n\n${text}`;
      }
      return { ok: true, error: null, next: ackPrefix + text };
    }

    await this.sb
      .from('deliveries')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_q_idx: currentQIdx + 1,
      })
      .eq('id', deliveryId);
    return { ok: true, error: null, next: ackPrefix + getCompletionMessage(this.config) };
  }

  // ---- First-question helpers (used by scheduler when sending) ----------

  async getFirstQuestionTextForSession(sessionId: number): Promise<string | null> {
    const qs = await this.getQuestionsForSession(sessionId);
    return qs && qs.length > 0 ? qs[0].text : null;
  }

  async getQuestionForSessionProgress(
    sessionId: number,
    currentQIdx: number,
  ): Promise<SurveyQuestion | null> {
    const qs = await this.getQuestionsForSession(sessionId);
    if (!qs) return null;
    return questionAtProgress(qs, currentQIdx);
  }
}

export type { FlagSeverity, FlagType };
