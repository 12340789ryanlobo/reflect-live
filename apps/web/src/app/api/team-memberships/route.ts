// POST /api/team-memberships    — athlete submits a join request
// GET  /api/team-memberships    — current user lists their own memberships
//
// On POST:
//   body: { team_id, name, email }
//   Creates a team_memberships row at status='requested' for this user
//   on this team. If the user already has a row on this team, returns
//   400 (don't double-request, don't auto-flip from denied/left back to
//   requested without an explicit reset action).
//
// On GET:
//   returns rows where clerk_user_id = current user. RLS allows this
//   directly, but we use the service-role here too for consistency
//   with the rest of the API.

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = serviceClient();
  const { data, error } = await sb
    .from('team_memberships')
    .select('*')
    .eq('clerk_user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memberships: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { team_id?: unknown; name?: unknown; email?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const teamId = Number(body.team_id);
  if (!Number.isInteger(teamId)) {
    return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });

  let email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email) {
    // Pull from Clerk if the client didn't pass one (defensive — the form
    // pre-fills from Clerk profile, but if it's stripped we fall back).
    const u = await currentUser();
    email = u?.primaryEmailAddress?.emailAddress ?? '';
  }

  const sb = serviceClient();

  // Verify the team exists and is in active state.
  const { data: team } = await sb
    .from('teams')
    .select('id, creation_status')
    .eq('id', teamId)
    .maybeSingle<{ id: number; creation_status: string }>();
  if (!team) return NextResponse.json({ error: 'team_not_found' }, { status: 404 });
  if (team.creation_status !== 'active') {
    return NextResponse.json({ error: 'team_not_open' }, { status: 400 });
  }

  // Prevent duplicate requests on the same team.
  const { data: existing } = await sb
    .from('team_memberships')
    .select('clerk_user_id, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle<{ status: string }>();
  if (existing) {
    return NextResponse.json(
      { error: 'already_member_or_pending', status: existing.status },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('team_memberships')
    .insert({
      clerk_user_id: userId,
      team_id: teamId,
      role: 'athlete',
      status: 'requested',
      default_team: false,
      requested_name: name,
      requested_email: email || null,
      requested_at: now,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, membership: data });
}
