// PATCH /api/team-memberships/:teamId
//
// Self-service membership actions for the calling user only:
//   { action: 'cancel' } — withdraw a pending request (requested → left)
//   { action: 'leave'  } — voluntarily leave an active team (active → left)
//
// Coach-side actions (approve/deny/remove) live in phase 1c on a
// different endpoint (and require team-manager auth).

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
  ctx: { params: Promise<{ teamId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { teamId: teamIdStr } = await ctx.params;
  const teamId = Number(teamIdStr);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });

  let body: { action?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const action = body.action;
  if (action !== 'cancel' && action !== 'leave') {
    return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data: existing } = await sb
    .from('team_memberships')
    .select('clerk_user_id, team_id, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle<{ status: string }>();
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const requiredStatus = action === 'cancel' ? 'requested' : 'active';
  if (existing.status !== requiredStatus) {
    return NextResponse.json(
      { error: 'wrong_status', expected: requiredStatus, actual: existing.status },
      { status: 400 },
    );
  }

  const { data, error } = await sb
    .from('team_memberships')
    .update({
      status: 'left',
      decided_at: new Date().toISOString(),
      decided_by: userId,
      // default_team flip handled implicitly: a 'left' row cannot be the
      // default; if this was the user's default team we let dashboard-shell
      // pick a new one on next render.
      default_team: false,
    })
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, membership: data });
}
