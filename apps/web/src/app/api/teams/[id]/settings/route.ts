// PATCH /api/teams/:id/settings — coach-editable team settings
//
// Authorization: caller must be an active coach on the team, or a
// platform admin. Captain/athlete callers get 403.
//
// Body is a partial of a small whitelist; unknown keys are ignored.
//   { captain_can_view_sessions?: boolean }

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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const teamId = Number(idStr);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const sb = serviceClient();

  const [{ data: membership }, { data: prefs }] = await Promise.all([
    sb.from('team_memberships')
      .select('role, status')
      .eq('clerk_user_id', userId)
      .eq('team_id', teamId)
      .maybeSingle<{ role: string; status: string }>(),
    sb.from('user_preferences')
      .select('is_platform_admin')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ is_platform_admin: boolean }>(),
  ]);

  const isCoach = membership?.status === 'active' && membership.role === 'coach';
  const isPlatformAdmin = prefs?.is_platform_admin === true;
  if (!isCoach && !isPlatformAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.captain_can_view_sessions === 'boolean') {
    patch.captain_can_view_sessions = body.captain_can_view_sessions;
  }
  if ('competition_start_date' in body) {
    const v = body.competition_start_date;
    if (v === null || v === '') {
      patch.competition_start_date = null;
    } else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      patch.competition_start_date = v;
    } else {
      return NextResponse.json(
        { error: 'bad_competition_start_date', detail: 'expected YYYY-MM-DD or null' },
        { status: 400 },
      );
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no_valid_fields' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('teams')
    .update(patch)
    .eq('id', teamId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, team: data });
}
