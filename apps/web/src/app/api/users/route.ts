import { auth, clerkClient } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }), userId: null, adminTeamId: null };
  const sb = serviceClient();
  const { data } = await sb.from('user_preferences').select('role,team_id').eq('clerk_user_id', userId).maybeSingle();
  if (data?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }), userId, adminTeamId: null };
  }
  return { error: null, userId, adminTeamId: data.team_id as number };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const sb = serviceClient();
  const { data: prefs } = await sb.from('user_preferences').select('*').order('created_at');
  const clerk = await clerkClient();

  const rows = await Promise.all(
    (prefs ?? []).map(async (p) => {
      try {
        const u = await clerk.users.getUser(p.clerk_user_id);
        return {
          clerk_user_id: p.clerk_user_id,
          email: u.emailAddresses?.[0]?.emailAddress ?? null,
          name: u.fullName ?? null,
          role: p.role ?? 'coach',
          team_id: p.team_id as number,
          impersonate_player_id: p.impersonate_player_id ?? null,
          group_filter: p.group_filter ?? null,
          created_at: p.created_at,
        };
      } catch {
        return {
          clerk_user_id: p.clerk_user_id,
          email: null,
          name: null,
          role: p.role ?? 'coach',
          team_id: p.team_id as number,
          impersonate_player_id: p.impersonate_player_id ?? null,
          group_filter: p.group_filter ?? null,
          created_at: p.created_at,
        };
      }
    }),
  );
  return NextResponse.json({ users: rows });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json();
  const { clerk_user_id, role, impersonate_player_id } = body as {
    clerk_user_id?: string;
    role?: string;
    impersonate_player_id?: number | null;
  };
  if (!clerk_user_id) return NextResponse.json({ error: 'clerk_user_id required' }, { status: 400 });
  const sb = serviceClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (role !== undefined) {
    if (!['admin', 'coach', 'captain', 'athlete'].includes(role)) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 });
    }
    if (clerk_user_id === gate.userId && role !== 'admin') {
      return NextResponse.json({ error: 'cannot demote yourself — promote another admin first' }, { status: 400 });
    }
    patch.role = role;
  }

  if (impersonate_player_id !== undefined) {
    // Nullable: pass null to unlink.
    if (impersonate_player_id === null) {
      patch.impersonate_player_id = null;
    } else if (typeof impersonate_player_id !== 'number') {
      return NextResponse.json({ error: 'impersonate_player_id must be a number or null' }, { status: 400 });
    } else {
      // Validate the player exists AND belongs to the target user's team.
      const { data: target } = await sb.from('user_preferences').select('team_id').eq('clerk_user_id', clerk_user_id).maybeSingle();
      if (!target) return NextResponse.json({ error: 'target user has no preferences row' }, { status: 400 });
      const { data: player } = await sb.from('players').select('id,team_id').eq('id', impersonate_player_id).maybeSingle();
      if (!player) return NextResponse.json({ error: 'player not found' }, { status: 400 });
      if (player.team_id !== target.team_id) {
        return NextResponse.json({ error: 'player is on a different team than the user' }, { status: 400 });
      }
      patch.impersonate_player_id = impersonate_player_id;
    }
  }

  const { error } = await sb.from('user_preferences').update(patch).eq('clerk_user_id', clerk_user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
