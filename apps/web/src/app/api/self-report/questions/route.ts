// GET /api/self-report/questions
//
// Returns the deduped question list an athlete should see in the
// self-report dialog. Sources, in order of preference:
//   1. Distinct questions from non-deleted sessions in the last 14 days
//      on the caller's team (first-seen order across most-recent first).
//   2. Questions from the single most recent non-deleted session, if no
//      sessions in the 14d window have questions.
//   3. Empty list (the dialog falls back to the legacy readiness-only
//      input).
//
// Auth: any logged-in user with a team_id in user_preferences.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

interface QuestionDef {
  id: string;
  text: string;
  type: string;
  order: number;
  show_if?: string;
  depends_on?: string;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = serviceClient();
  const url = new URL(req.url);
  // Caller may pass an explicit team_id (admin viewing as athlete on
  // a specific team); otherwise pull from prefs.
  let teamId = Number(url.searchParams.get('team_id')) || 0;
  if (!teamId) {
    const { data: prefs } = await sb
      .from('user_preferences')
      .select('team_id')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ team_id: number }>();
    teamId = prefs?.team_id ?? 0;
  }
  if (!teamId) return NextResponse.json({ questions: [], source: 'no-team' });

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  // Pull recent + most-recent sessions in two queries — separate so the
  // fallback path can answer cleanly when the 14d window is empty.
  const { data: recent } = await sb
    .from('sessions')
    .select('id, template_id, created_at, metadata_json')
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .gte('created_at', fourteenDaysAgo)
    .order('created_at', { ascending: false });
  const { data: latestOne } = await sb
    .from('sessions')
    .select('id, template_id, created_at, metadata_json')
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  // Collect template_ids referenced. Fetch templates once.
  const allSessions = [...(recent ?? []), ...(latestOne ?? [])];
  const templateIds = Array.from(
    new Set(
      allSessions
        .map((s) => s.template_id as number | null)
        .filter((x): x is number => x != null),
    ),
  );
  const templatesById = new Map<number, QuestionDef[]>();
  if (templateIds.length > 0) {
    const { data: tpls } = await sb
      .from('question_templates')
      .select('id, questions_json')
      .in('id', templateIds);
    for (const t of (tpls ?? []) as Array<{ id: number; questions_json: QuestionDef[] }>) {
      templatesById.set(t.id, Array.isArray(t.questions_json) ? t.questions_json : []);
    }
  }

  function questionsFor(session: { template_id: number | null; metadata_json: Record<string, unknown> | null }): QuestionDef[] {
    if (session.template_id != null) {
      return templatesById.get(session.template_id) ?? [];
    }
    // Fallback: some imported sessions carry questions directly on
    // metadata_json (cloned-from-old-reflect path).
    const mq = (session.metadata_json as { questions_json?: QuestionDef[] } | null)?.questions_json;
    return Array.isArray(mq) ? mq : [];
  }

  function dedupe(sessions: typeof allSessions): QuestionDef[] {
    const seen = new Set<string>();
    const out: QuestionDef[] = [];
    for (const s of sessions) {
      for (const q of questionsFor(s)) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        out.push(q);
      }
    }
    return out.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

  // Source 1: dedupe across last 14 days.
  const fromRecent = dedupe(recent ?? []);
  if (fromRecent.length > 0) {
    return NextResponse.json({ questions: fromRecent, source: 'last-14d' });
  }

  // Source 2: fall back to the single most-recent non-deleted session.
  const fromLatest = dedupe(latestOne ?? []);
  if (fromLatest.length > 0) {
    return NextResponse.json({ questions: fromLatest, source: 'last-session' });
  }

  return NextResponse.json({ questions: [], source: 'none' });
}
