// PATCH /api/me/gender — let an athlete set their own gender on the player
// they're linked to. Determines the linked player from
// user_preferences.impersonate_player_id (which is only writable after the
// user proves phone ownership via SMS OTP, so this is a self-service write
// scoped to a player they've already verified).

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

  let body: { gender?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const g = body.gender;
  if (g !== null && g !== 'male' && g !== 'female') {
    return NextResponse.json({ error: 'bad_gender' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('impersonate_player_id, team_id')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref?.impersonate_player_id) {
    return NextResponse.json({ error: 'no_linked_athlete' }, { status: 403 });
  }

  const { error } = await sb
    .from('players')
    .update({ gender: g })
    .eq('id', pref.impersonate_player_id)
    .eq('team_id', pref.team_id);
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, gender: g });
}
