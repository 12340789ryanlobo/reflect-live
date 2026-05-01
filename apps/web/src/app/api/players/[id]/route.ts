/**
 * PATCH/DELETE /api/players/[id]
 *
 * Coach- and admin-driven roster management. Coach must be an active
 * coach on the player's team; platform admin always has access. PATCH
 * supports editing name / group / phone_e164 / active / gender, plus a
 * special `membership_role` field that flips the linked
 * team_memberships row to 'captain' or 'athlete' (only valid when the
 * player has a Clerk-linked membership). DELETE remains admin-only —
 * it's destructive and cascades to multiple tables.
 */

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Returns the player's team_id when the caller is allowed to manage
// roster on it (active coach OR platform admin). Otherwise returns the
// matching error response so the caller can early-return.
async function requireRosterManager(playerId: number):
  Promise<{ ok: true; teamId: number; userId: string } | { ok: false; res: NextResponse }>
{
  const { userId } = await auth();
  if (!userId) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const sb = serviceClient();

  const { data: existing } = await sb.from('players').select('team_id').eq('id', playerId).maybeSingle<{ team_id: number }>();
  if (!existing) return { ok: false, res: NextResponse.json({ error: 'player_not_found' }, { status: 404 }) };

  const [{ data: mem }, { data: prefs }] = await Promise.all([
    sb.from('team_memberships')
      .select('role, status')
      .eq('clerk_user_id', userId)
      .eq('team_id', existing.team_id)
      .maybeSingle<{ role: string; status: string }>(),
    sb.from('user_preferences')
      .select('is_platform_admin')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ is_platform_admin: boolean }>(),
  ]);

  const isCoach = mem?.status === 'active' && mem.role === 'coach';
  const isPlatformAdmin = prefs?.is_platform_admin === true;
  if (!isCoach && !isPlatformAdmin) {
    return { ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, teamId: existing.team_id, userId };
}

async function requireAdmin(): Promise<{ ok: true; teamId: number } | { ok: false; res: NextResponse }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const sb = serviceClient();
  const { data } = await sb.from('user_preferences').select('role,team_id,is_platform_admin').eq('clerk_user_id', userId).maybeSingle<{ role: string; team_id: number; is_platform_admin: boolean }>();
  if (data?.role !== 'admin' && data?.is_platform_admin !== true) {
    return { ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, teamId: data.team_id as number };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const gate = await requireRosterManager(playerId);
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const allowed = ['name', 'group', 'phone_e164', 'active', 'gender'];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  if ('gender' in patch && patch.gender !== null && patch.gender !== 'male' && patch.gender !== 'female') {
    return NextResponse.json({ error: 'bad_gender' }, { status: 400 });
  }
  // Empty string from a form input should null the column rather than store ''.
  if ('group' in patch && (patch.group === '' || patch.group === undefined)) {
    patch.group = null;
  }

  const sb = serviceClient();

  // Cross-team guard already enforced via requireRosterManager — gate.teamId
  // is always the player's own team. No second fetch needed.

  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from('players').update(patch).eq('id', playerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Optional captain promotion / demotion. Requires the player to have
  // a linked active team_membership row. Reject if missing — coach has
  // to wait for the athlete to claim via Clerk first.
  if ('membership_role' in body) {
    const newRole = body.membership_role;
    if (newRole !== 'captain' && newRole !== 'athlete') {
      return NextResponse.json({ error: 'bad_membership_role' }, { status: 400 });
    }
    const { data: linkedMem } = await sb
      .from('team_memberships')
      .select('clerk_user_id, role')
      .eq('team_id', gate.teamId)
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle<{ clerk_user_id: string; role: string }>();
    if (!linkedMem) {
      return NextResponse.json(
        { error: 'no_linked_membership', detail: 'Athlete has no active membership; cannot change role yet.' },
        { status: 400 },
      );
    }
    if (linkedMem.role !== newRole) {
      const { error: roleErr } = await sb
        .from('team_memberships')
        .update({ role: newRole })
        .eq('clerk_user_id', linkedMem.clerk_user_id)
        .eq('team_id', gate.teamId);
      if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

      // Heal the user_preferences.role row so the affected user's next
      // dashboard render uses the new role. dashboard-shell also heals
      // this on next mount, but doing it here means the change is
      // immediate for already-loaded sessions on this server.
      await sb
        .from('user_preferences')
        .update({ role: newRole })
        .eq('clerk_user_id', linkedMem.clerk_user_id);
    }
  }

  if (Object.keys(patch).length === 0 && !('membership_role' in body)) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const sb = serviceClient();
  const { data: existing } = await sb.from('players').select('id,team_id').eq('id', playerId).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.team_id !== gate.teamId) return NextResponse.json({ error: 'cross-team delete forbidden' }, { status: 403 });

  // Cascade in order: null refs from soft tables, hard-delete dependent rows,
  // then the player row itself.
  await sb.from('user_preferences').update({ impersonate_player_id: null }).eq('impersonate_player_id', playerId);
  await sb.from('twilio_messages').update({ player_id: null }).eq('player_id', playerId);
  await sb.from('activity_logs').delete().eq('player_id', playerId);

  const { error: delErr } = await sb.from('players').delete().eq('id', playerId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
