// apps/web/src/app/api/team/scoring/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { workout_score?: unknown; rehab_score?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const ws = Number(body.workout_score);
  const rs = Number(body.rehab_score);
  if (!Number.isFinite(ws) || ws < 0 || ws > 100) {
    return NextResponse.json({ error: 'workout_score_out_of_range' }, { status: 400 });
  }
  if (!Number.isFinite(rs) || rs < 0 || rs > 100) {
    return NextResponse.json({ error: 'rehab_score_out_of_range' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('team_id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref) return NextResponse.json({ error: 'no_team' }, { status: 403 });

  const role = (pref.role ?? 'coach') as string;
  if (role !== 'coach' && role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const newConfig = { workout_score: ws, rehab_score: rs };
  const { error } = await sb
    .from('teams')
    .update({ scoring_json: newConfig })
    .eq('id', pref.team_id);

  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, scoring_json: newConfig });
}
