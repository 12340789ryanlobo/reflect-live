// PATCH /api/templates/:id  — rename, swap question list, set/unset is_default
// DELETE /api/templates/:id — hard delete (sessions reference question_templates
//   via ON DELETE SET NULL; previously-run sessions keep their frozen snapshot
//   in metadata_json so their detail pages stay readable).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import type { SurveyQuestion } from '@reflect-live/shared';

const SESSION_TYPES = ['practice', 'match', 'lifting'] as const;
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
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as Partial<SurveyQuestion>;
    if (!q || typeof q !== 'object') return { ok: false, error: `question_${i}_invalid` };
    if (typeof q.text !== 'string' || !q.text.trim()) return { ok: false, error: `question_${i}_text_required` };
    if (q.text.length > 500) return { ok: false, error: `question_${i}_text_too_long` };
    if (typeof q.type !== 'string' || !(QUESTION_TYPES as readonly string[]).includes(q.type)) {
      return { ok: false, error: `question_${i}_bad_type` };
    }
    const id = (q.id ?? `q${i + 1}`).toString();
    if (seen.has(id)) return { ok: false, error: `duplicate_question_id_${id}` };
    seen.add(id);
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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const ok = await authorize(userId);
  if ('error' in ok) return NextResponse.json({ error: ok.error }, { status: 403 });

  let body: { name?: unknown; session_type?: unknown; questions?: unknown; is_default?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const update: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
    if (name.length > 80) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });
    update.name = name;
  }
  let nextSessionType: 'practice' | 'match' | 'lifting' | null = null;
  if (typeof body.session_type === 'string') {
    if (!(SESSION_TYPES as readonly string[]).includes(body.session_type)) {
      return NextResponse.json({ error: 'bad_session_type' }, { status: 400 });
    }
    nextSessionType = body.session_type as 'practice' | 'match' | 'lifting';
    update.session_type = nextSessionType;
  }
  if (body.questions !== undefined) {
    const v = validateQuestions(body.questions);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    update.questions_json = v.questions;
  }
  if (body.is_default !== undefined) update.is_default = body.is_default === true;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 });
  }

  // If the user is flipping is_default ON, clear other defaults for the same
  // (team, session_type). Need the existing row to know the old session_type.
  if (update.is_default === true) {
    const { data: existing } = await ok.sb
      .from('question_templates')
      .select('session_type')
      .eq('id', id)
      .eq('team_id', ok.teamId)
      .maybeSingle();
    const targetType = nextSessionType ?? existing?.session_type;
    if (targetType) {
      await ok.sb
        .from('question_templates')
        .update({ is_default: false })
        .eq('team_id', ok.teamId)
        .eq('session_type', targetType)
        .neq('id', id);
    }
  }

  const { data, error } = await ok.sb
    .from('question_templates')
    .update(update)
    .eq('id', id)
    .eq('team_id', ok.teamId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const ok = await authorize(userId);
  if ('error' in ok) return NextResponse.json({ error: ok.error }, { status: 403 });

  const { error } = await ok.sb
    .from('question_templates')
    .delete()
    .eq('id', id)
    .eq('team_id', ok.teamId);
  if (error) return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
