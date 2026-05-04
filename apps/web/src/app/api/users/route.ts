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

  // Bulk-fetch all memberships + every team so we can render the multi-team
  // membership picture without N+1 queries against Supabase.
  const [{ data: mems }, { data: teams }] = await Promise.all([
    sb.from('team_memberships').select('clerk_user_id, team_id, role, status'),
    sb.from('teams').select('id, name'),
  ]);
  const teamName = new Map<number, string>();
  for (const t of (teams ?? []) as Array<{ id: number; name: string }>) teamName.set(t.id, t.name);
  const memsByUser = new Map<string, Array<{ team_id: number; team_name: string; role: string; status: string }>>();
  for (const m of (mems ?? []) as Array<{ clerk_user_id: string; team_id: number; role: string; status: string }>) {
    const list = memsByUser.get(m.clerk_user_id) ?? [];
    list.push({
      team_id: m.team_id,
      team_name: teamName.get(m.team_id) ?? `team ${m.team_id}`,
      role: m.role,
      status: m.status,
    });
    memsByUser.set(m.clerk_user_id, list);
  }

  const clerk = await clerkClient();

  const rows = await Promise.all(
    (prefs ?? []).map(async (p) => {
      const memberships = memsByUser.get(p.clerk_user_id) ?? [];
      const base = {
        clerk_user_id: p.clerk_user_id,
        role: p.role ?? 'coach',
        team_id: p.team_id as number,
        team_name: teamName.get(p.team_id) ?? null,
        memberships,
        impersonate_player_id: p.impersonate_player_id ?? null,
        group_filter: p.group_filter ?? null,
        created_at: p.created_at,
      };
      try {
        const u = await clerk.users.getUser(p.clerk_user_id);
        return {
          ...base,
          email: u.emailAddresses?.[0]?.emailAddress ?? null,
          name: u.fullName ?? null,
        };
      } catch {
        return { ...base, email: null, name: null };
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

  // The 'linked athlete' is canonically stored on team_memberships.player_id
  // for the user's *active* membership; user_preferences.impersonate_player_id
  // is a denormalized mirror that dashboard-shell auto-heals from the
  // membership on every load. Writing only to prefs would silently revert
  // on the next render for non-admins. So we write to BOTH, with the
  // membership row as the source of truth.
  let targetTeamId: number | null = null;
  if (impersonate_player_id !== undefined) {
    if (impersonate_player_id === null) {
      patch.impersonate_player_id = null;
    } else if (typeof impersonate_player_id !== 'number') {
      return NextResponse.json({ error: 'impersonate_player_id must be a number or null' }, { status: 400 });
    } else {
      const { data: target } = await sb.from('user_preferences').select('team_id').eq('clerk_user_id', clerk_user_id).maybeSingle();
      if (!target) return NextResponse.json({ error: 'target user has no preferences row' }, { status: 400 });
      const { data: player } = await sb.from('players').select('id,team_id').eq('id', impersonate_player_id).maybeSingle();
      if (!player) return NextResponse.json({ error: 'player not found' }, { status: 400 });
      if (player.team_id !== target.team_id) {
        return NextResponse.json({ error: 'player is on a different team than the user' }, { status: 400 });
      }
      patch.impersonate_player_id = impersonate_player_id;
      targetTeamId = target.team_id as number;
    }
  }

  const { error } = await sb.from('user_preferences').update(patch).eq('clerk_user_id', clerk_user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mirror to team_memberships.player_id so the heal cascade preserves the
  // link instead of nulling it. impersonate_player_id === undefined means
  // 'role-only update' — leave the membership untouched.
  if (impersonate_player_id !== undefined) {
    // Look up the team scope when we're unlinking — we still need to
    // know which membership row to clear.
    if (targetTeamId === null && impersonate_player_id === null) {
      const { data: target } = await sb.from('user_preferences').select('team_id').eq('clerk_user_id', clerk_user_id).maybeSingle();
      targetTeamId = (target?.team_id as number | undefined) ?? null;
    }
    if (targetTeamId != null) {
      const { error: memErr } = await sb
        .from('team_memberships')
        .update({ player_id: impersonate_player_id })
        .eq('clerk_user_id', clerk_user_id)
        .eq('team_id', targetTeamId)
        .eq('status', 'active');
      if (memErr) {
        return NextResponse.json(
          { error: 'membership_update_failed', detail: memErr.message },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// Hard-delete a user from the platform: removes team_memberships,
// phone_verifications, user_preferences, and the Clerk auth row itself.
// Player roster rows (`players`) are intentionally preserved — they're
// shared team data, not per-account data, and the deleted user (or a
// future user) can re-link via /onboarding's join flow.
//
// Self-protection: an admin cannot delete their own account from this
// endpoint (would lock themselves out and orphan platform admin
// privileges). They have to ask another admin.
export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const clerk_user_id = url.searchParams.get('clerk_user_id');
  if (!clerk_user_id) return NextResponse.json({ error: 'clerk_user_id required' }, { status: 400 });
  if (clerk_user_id === gate.userId) {
    return NextResponse.json({ error: 'cannot delete your own account' }, { status: 400 });
  }

  const sb = serviceClient();

  // Order matters — child rows first.
  const { error: memErr } = await sb.from('team_memberships').delete().eq('clerk_user_id', clerk_user_id);
  if (memErr) return NextResponse.json({ error: `team_memberships: ${memErr.message}` }, { status: 500 });

  const { error: phErr } = await sb.from('phone_verifications').delete().eq('clerk_user_id', clerk_user_id);
  if (phErr) return NextResponse.json({ error: `phone_verifications: ${phErr.message}` }, { status: 500 });

  const { error: prefErr } = await sb.from('user_preferences').delete().eq('clerk_user_id', clerk_user_id);
  if (prefErr) return NextResponse.json({ error: `user_preferences: ${prefErr.message}` }, { status: 500 });

  // Clerk last — if the DB cleanup fails we want the auth row left intact
  // so the admin can retry safely. Going Clerk-first would leave dangling
  // DB rows on partial failure.
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(clerk_user_id);
  } catch (e) {
    return NextResponse.json(
      { error: `clerk delete failed (DB rows already removed): ${(e as Error).message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
