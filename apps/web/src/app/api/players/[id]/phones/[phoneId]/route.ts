// PATCH  /api/players/:id/phones/:phoneId  — { label?, is_primary?: true }
// DELETE /api/players/:id/phones/:phoneId  — remove a phone
//
// 'is_primary' can only be set TO true (you promote a phone). Demotion
// happens implicitly when another phone is promoted, since there's
// always exactly one primary. Setting is_primary=false directly is
// a 400 — we'd be left with no primary.
//
// DELETE refuses if the row is the only phone (would orphan the
// player). It also refuses to delete the current primary unless
// there's another phone to promote — caller must promote first.

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

interface AuthedPlayer {
  team_id: number;
  isCoach: boolean;
  isPlatformAdmin: boolean;
  isSelf: boolean;
}

async function authorize(playerId: number): Promise<
  | { ok: true; ctx: AuthedPlayer }
  | { ok: false; res: NextResponse }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const sb = serviceClient();
  const { data: player } = await sb
    .from('players')
    .select('team_id')
    .eq('id', playerId)
    .maybeSingle<{ team_id: number }>();
  if (!player) return { ok: false, res: NextResponse.json({ error: 'player_not_found' }, { status: 404 }) };

  const [{ data: mem }, { data: prefs }] = await Promise.all([
    sb.from('team_memberships')
      .select('role, status, player_id')
      .eq('clerk_user_id', userId)
      .eq('team_id', player.team_id)
      .maybeSingle<{ role: string; status: string; player_id: number | null }>(),
    sb.from('user_preferences')
      .select('is_platform_admin, impersonate_player_id')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ is_platform_admin: boolean; impersonate_player_id: number | null }>(),
  ]);
  const isPlatformAdmin = prefs?.is_platform_admin === true;
  const isActiveMember = mem?.status === 'active';
  if (!isActiveMember && !isPlatformAdmin) {
    return { ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  const isCoach = mem?.role === 'coach';
  const isSelf = mem?.player_id === playerId || prefs?.impersonate_player_id === playerId;
  if (!isCoach && !isPlatformAdmin && !isSelf) {
    return { ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, ctx: { team_id: player.team_id, isCoach, isPlatformAdmin, isSelf } };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phoneId: string }> },
) {
  const { id, phoneId: phoneIdStr } = await params;
  const playerId = Number(id);
  const phoneId = Number(phoneIdStr);
  if (!Number.isInteger(playerId) || !Number.isInteger(phoneId)) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }
  const gate = await authorize(playerId);
  if (!gate.ok) return gate.res;

  let body: { label?: unknown; is_primary?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const sb = serviceClient();

  const { data: existing } = await sb
    .from('player_phones')
    .select('id, e164, is_primary')
    .eq('id', phoneId)
    .eq('player_id', playerId)
    .maybeSingle<{ id: number; e164: string; is_primary: boolean }>();
  if (!existing) return NextResponse.json({ error: 'phone_not_found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if ('label' in body) {
    if (body.label === null || body.label === '') {
      patch.label = null;
    } else if (typeof body.label === 'string') {
      patch.label = body.label.trim().slice(0, 40) || null;
    } else {
      return NextResponse.json({ error: 'bad_label' }, { status: 400 });
    }
  }

  // is_primary can only be set TO true. Setting false directly leaves
  // the player with no primary, which the unique partial index allows
  // but breaks every consumer.
  let promote = false;
  if ('is_primary' in body) {
    if (body.is_primary !== true) {
      return NextResponse.json(
        { error: 'cannot_demote_directly', detail: 'Promote a different phone instead.' },
        { status: 400 },
      );
    }
    promote = !existing.is_primary;
  }

  if (promote) {
    // Demote the current primary first.
    const { error: demoteErr } = await sb
      .from('player_phones')
      .update({ is_primary: false })
      .eq('player_id', playerId)
      .eq('is_primary', true);
    if (demoteErr) return NextResponse.json({ error: 'demote_failed', detail: demoteErr.message }, { status: 500 });
    patch.is_primary = true;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  const { data: updated, error } = await sb
    .from('player_phones')
    .update(patch)
    .eq('id', phoneId)
    .select('id, e164, label, is_primary, created_at')
    .single();
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });

  if (promote) {
    await sb.from('players').update({ phone_e164: existing.e164 }).eq('id', playerId);
  }

  return NextResponse.json({ ok: true, phone: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; phoneId: string }> },
) {
  const { id, phoneId: phoneIdStr } = await params;
  const playerId = Number(id);
  const phoneId = Number(phoneIdStr);
  if (!Number.isInteger(playerId) || !Number.isInteger(phoneId)) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }
  const gate = await authorize(playerId);
  if (!gate.ok) return gate.res;

  const sb = serviceClient();
  const { data: existing } = await sb
    .from('player_phones')
    .select('id, is_primary')
    .eq('id', phoneId)
    .eq('player_id', playerId)
    .maybeSingle<{ id: number; is_primary: boolean }>();
  if (!existing) return NextResponse.json({ error: 'phone_not_found' }, { status: 404 });

  if (existing.is_primary) {
    return NextResponse.json(
      { error: 'cannot_delete_primary', detail: 'Promote a different phone first, then delete this one.' },
      { status: 400 },
    );
  }

  const { error } = await sb.from('player_phones').delete().eq('id', phoneId);
  if (error) return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
