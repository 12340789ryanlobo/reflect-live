// apps/web/src/app/api/injury-reports/route.ts
//
// POST: log a new injury report. Coaches/admins can log for any player on
// their team. Athletes can self-report (player_id forced to their linked
// athlete).
// PATCH /api/injury-reports/:id: not here — see [id]/route.ts for resolve.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { parseInjuryRegions } from '@/lib/injury-aliases';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { player_id?: number; description?: string; severity?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const description = (body.description ?? '').trim();
  if (!description) {
    return NextResponse.json({ error: 'description_required' }, { status: 400 });
  }
  const severity =
    body.severity === undefined || body.severity === null
      ? null
      : Number(body.severity);
  if (severity !== null && (!Number.isInteger(severity) || severity < 1 || severity > 5)) {
    return NextResponse.json({ error: 'severity_out_of_range' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('team_id, role, impersonate_player_id')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref) return NextResponse.json({ error: 'no_team' }, { status: 403 });

  const role = (pref.role ?? 'coach') as string;

  // Determine target player_id.
  let playerId: number | null = body.player_id ?? null;
  if (role === 'athlete') {
    // Athletes can only report for themselves.
    playerId = (pref.impersonate_player_id as number | null) ?? null;
    if (!playerId) {
      return NextResponse.json({ error: 'no_linked_athlete' }, { status: 403 });
    }
  } else if (role === 'captain' || role === 'coach' || role === 'admin') {
    if (!playerId || !Number.isInteger(playerId)) {
      return NextResponse.json({ error: 'player_id_required' }, { status: 400 });
    }
    // Verify the player is on this user's team.
    const { data: pl } = await sb.from('players').select('team_id').eq('id', playerId).maybeSingle();
    if (!pl || pl.team_id !== pref.team_id) {
      return NextResponse.json({ error: 'player_not_on_team' }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const regions = parseInjuryRegions(description);

  const { data, error } = await sb
    .from('injury_reports')
    .insert({
      team_id: pref.team_id,
      player_id: playerId,
      regions,
      severity,
      description,
      reported_by: userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, report: data });
}
