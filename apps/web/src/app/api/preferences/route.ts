import { auth, currentUser } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function computeInitialRole(
  userId: string,
  userEmail: string | undefined,
  teamId: number,
): Promise<'admin' | 'coach' | 'captain' | 'athlete'> {
  // BOOTSTRAP_ADMIN_EMAIL can be a single email or a comma-separated list.
  const adminEmails = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (userEmail && adminEmails.includes(userEmail.toLowerCase())) return 'admin';
  const sb = serviceClient();
  const { count } = await sb.from('user_preferences').select('clerk_user_id', { count: 'exact', head: true });
  if ((count ?? 0) === 0) return 'admin'; // first user becomes admin
  // team_memberships is the authoritative role for this user on this team.
  // Without this branch, athletes hitting POST /api/preferences before
  // dashboard-shell's fetchAll runs ended up with role='coach' (the schema
  // default) and then saw the coach view.
  const { data: mem } = await sb
    .from('team_memberships')
    .select('role')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .eq('status', 'active')
    .maybeSingle<{ role: 'athlete' | 'captain' | 'coach' }>();
  if (mem?.role) return mem.role;
  return 'coach';
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = serviceClient();
  const { data } = await sb.from('user_preferences').select('*').eq('clerk_user_id', userId).maybeSingle();

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
  const adminEmails = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isBootstrapAdmin = !!email && adminEmails.includes(email);
  const canSwitchRole = (data?.role === 'admin') || isBootstrapAdmin;

  // Bundle the team in the same response so dashboard-shell doesn't have
  // to do a second sb.from('teams') query — that path hits RLS on the
  // browser client and 406s when the JWT/policy mismatch (which has been
  // happening intermittently for fresh users).
  let team: Record<string, unknown> | null = null;
  if (data?.team_id) {
    const { data: t } = await sb.from('teams').select('*').eq('id', data.team_id).maybeSingle();
    team = t ?? null;
  }

  return NextResponse.json({ preferences: data, can_switch_role: canSwitchRole, team });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { team_id, watchlist = [], group_filter = null, role = null, impersonate_player_id = null } = body;
  if (typeof team_id !== 'number') return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const sb = serviceClient();
  const { data: existing } = await sb.from('user_preferences').select('clerk_user_id,role').eq('clerk_user_id', userId).maybeSingle();

  // BOOTSTRAP_ADMIN_EMAIL is allowed to re-elevate themselves to admin even
  // after they've switched to a non-admin view (so they can flip back from
  // coach/captain/athlete). Without this, an admin who picks "Coach" in the
  // role switcher gets locked out of admin view.
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
  const adminEmails = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isBootstrapAdmin = !!email && adminEmails.includes(email);

  let effectiveRole: string | null = role;
  // Admin role-changes are unrestricted. Bootstrap-admin emails are also
  // unrestricted (covers the lock-out case above). Other users' role-change
  // requests are silently dropped.
  const canChangeRole = !existing || existing.role === 'admin' || isBootstrapAdmin;
  if (existing && !canChangeRole && role !== null && existing.role !== role) {
    effectiveRole = existing.role ?? 'coach';
  }
  if (!existing) {
    effectiveRole = await computeInitialRole(userId, email, team_id);
  }

  const payload: Record<string, unknown> = {
    clerk_user_id: userId,
    team_id,
    watchlist,
    group_filter,
    updated_at: new Date().toISOString(),
  };
  if (effectiveRole !== null) payload.role = effectiveRole;
  // Admins (and bootstrap-admin emails switching back) can set impersonate_player_id.
  // Other users must prove phone ownership via POST /api/link-phone.
  if ((existing && existing.role === 'admin') || isBootstrapAdmin) {
    payload.impersonate_player_id = impersonate_player_id;
  }

  const { data: upserted, error } = await sb
    .from('user_preferences')
    .upsert(payload, { onConflict: 'clerk_user_id' })
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bundle the team alongside the prefs so dashboard-shell's auto-create
  // path doesn't need a follow-up sb.from('teams') query (which hits
  // browser-client RLS and 406s for some fresh users).
  let team: Record<string, unknown> | null = null;
  if (upserted?.team_id) {
    const { data: t } = await sb.from('teams').select('*').eq('id', upserted.team_id).maybeSingle();
    team = t ?? null;
  }

  return NextResponse.json({ ok: true, role: effectiveRole, preferences: upserted, team });
}
