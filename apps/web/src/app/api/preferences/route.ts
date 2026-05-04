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
  _userEmail: string | undefined,
  teamId: number,
): Promise<'admin' | 'coach' | 'captain' | 'athlete'> {
  // team_memberships.role is authoritative for this user on this team.
  // Bootstrap-admin emails (BOOTSTRAP_ADMIN_EMAIL env var) used to also
  // override role to 'admin' here, but that conflated two concerns:
  // platform-wide admin access (is_platform_admin) vs the user's role
  // on a specific team. A platform admin who joins a team as an
  // athlete should be 'athlete' on that team — they keep admin access
  // via is_platform_admin, not via the membership role. So the email
  // check is gone; admin elevation now happens purely via the
  // is_platform_admin flag set on the prefs row.
  const sb = serviceClient();
  const { count } = await sb.from('user_preferences').select('clerk_user_id', { count: 'exact', head: true });
  if ((count ?? 0) === 0) return 'admin'; // first ever user bootstraps as admin
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
  // Admin detection follows the same rule as dashboard-shell: prefer
  // the stable is_platform_admin flag over prefs.role, which the
  // role-switcher itself overwrites. Without this, an admin who picks
  // "View as coach" loses can_switch_role and can't get back.
  const canSwitchRole =
    data?.is_platform_admin === true ||
    data?.role === 'admin' ||
    isBootstrapAdmin;

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

  // Need the is_platform_admin flag too — same reason as the GET path:
  // a real platform admin who's switched to 'coach' has prefs.role='coach'
  // but is still an admin, so they should still be allowed to switch
  // back. Without this check, an admin who once viewed as coach was
  // permanently locked into that view.
  const { data: existingFull } = await sb
    .from('user_preferences')
    .select('is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  const isStablePlatformAdmin = existingFull?.is_platform_admin === true;

  let effectiveRole: string | null = role;
  const canChangeRole =
    !existing ||
    existing.role === 'admin' ||
    isStablePlatformAdmin ||
    isBootstrapAdmin;
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
  // BOOTSTRAP_ADMIN_EMAIL → is_platform_admin=true on first creation.
  // We only set this on insert (no existing row); on subsequent
  // updates the flag is left alone so an admin can intentionally
  // demote themselves via SQL without it bouncing back.
  if (!existing && isBootstrapAdmin) {
    payload.is_platform_admin = true;
  }
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
