// apps/web/src/app/api/templates/route.ts
//
// POST: create a question_template for the user's team. Coaches/captains/admins
// can author. Templates store a frozen `questions_json` array which the
// SurveyEngine will read when a session uses this template.
//
// Templates are scoped per (team_id, session_type). At most one template per
// session_type can be marked is_default — when a session is created with no
// explicit template, the default for that type wins.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import type { SurveyQuestion } from '@reflect-live/shared';

const SESSION_TYPES = ['practice', 'match', 'lifting'] as const;
type SessionType = (typeof SESSION_TYPES)[number];

const QUESTION_TYPES = [
  'scale_1_10', 'binary', 'choice_1_3', 'captain_rating',
  'multi_select_body_regions', 'free_text',
] as const;

const MAX_QUESTIONS = 8;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function validateQuestions(raw: unknown): { ok: true; questions: SurveyQuestion[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'questions_must_be_array' };
  if (raw.length === 0) return { ok: false, error: 'at_least_one_question' };
  if (raw.length > MAX_QUESTIONS) return { ok: false, error: 'too_many_questions' };

  const out: SurveyQuestion[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as Partial<SurveyQuestion>;
    if (!q || typeof q !== 'object') return { ok: false, error: `question_${i}_invalid` };
    if (typeof q.text !== 'string' || !q.text.trim()) return { ok: false, error: `question_${i}_text_required` };
    if (q.text.length > 500) return { ok: false, error: `question_${i}_text_too_long` };
    if (typeof q.type !== 'string' || !(QUESTION_TYPES as readonly string[]).includes(q.type)) {
      return { ok: false, error: `question_${i}_bad_type` };
    }
    const id = (q.id ?? `q${i + 1}`).toString();
    if (seenIds.has(id)) return { ok: false, error: `duplicate_question_id_${id}` };
    seenIds.add(id);
    out.push({
      id,
      order: i + 1,
      text: q.text.trim(),
      type: q.type as SurveyQuestion['type'],
      validation: q.validation ?? {},
      flag_rule: q.flag_rule,
      conditional: q.conditional,
      captain_only: q.captain_only,
      ack_on_yes: q.ack_on_yes,
    });
  }
  return { ok: true, questions: out };
}

async function authorize(userId: string) {
  const sb = serviceClient();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('team_id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref) return { error: 'no_team' as const };
  const role = (pref.role ?? 'coach') as string;
  if (!['coach', 'captain', 'admin'].includes(role)) return { error: 'forbidden' as const };
  return { sb, teamId: pref.team_id as number, role };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { name?: unknown; session_type?: unknown; questions?: unknown; is_default?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });

  const sessionType = body.session_type as SessionType;
  if (!SESSION_TYPES.includes(sessionType)) {
    return NextResponse.json({ error: 'bad_session_type' }, { status: 400 });
  }

  const validated = validateQuestions(body.questions);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const ok = await authorize(userId);
  if ('error' in ok) return NextResponse.json({ error: ok.error }, { status: 403 });

  const isDefault = body.is_default === true;
  if (isDefault) {
    // Clear any existing default for this (team, session_type) pair.
    await ok.sb
      .from('question_templates')
      .update({ is_default: false })
      .eq('team_id', ok.teamId)
      .eq('session_type', sessionType);
  }

  const { data, error } = await ok.sb
    .from('question_templates')
    .insert({
      team_id: ok.teamId,
      name,
      session_type: sessionType,
      questions_json: validated.questions,
      is_default: isDefault,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}
