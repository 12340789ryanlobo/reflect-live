// PATCH /api/me/active-team   body: { team_id }
//
// Switches which team is "currently active" for the caller. Auth:
//   1. Caller must have an active team_memberships row on that team, OR
//   2. Caller is is_platform_admin=true (pass-through to any team).
//
// Updates user_preferences.team_id (the legacy "currently viewing" pointer)
// — dashboard-shell already resolves the active membership row from this
// after sub-1 landed.

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

  let body: { team_id?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const teamId = Number(body.team_id);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });

  const sb = serviceClient();

  // Authorize: active membership on this team, or platform admin.
  const [mem, prefs] = await Promise.all([
    sb.from('team_memberships')
      .select('role, status')
      .eq('clerk_user_id', userId)
      .eq('team_id', teamId)
      .maybeSingle<{ role: string; status: string }>(),
    sb.from('user_preferences')
      .select('is_platform_admin, role')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ is_platform_admin: boolean; role: string | null }>(),
  ]);
  const hasActive = mem.data?.status === 'active';
  const isAdmin = prefs.data?.is_platform_admin === true || prefs.data?.role === 'admin';
  if (!hasActive && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Verify the team exists.
  const { data: team } = await sb.from('teams').select('id, name').eq('id', teamId).maybeSingle<{ id: number; name: string }>();
  if (!team) return NextResponse.json({ error: 'team_not_found' }, { status: 404 });

  // Update. We upsert so users created via the request flow before
  // user_preferences existed get a row created on first switch.
  const { error } = await sb
    .from('user_preferences')
    .upsert({
      clerk_user_id: userId,
      team_id: teamId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clerk_user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, team });
}
