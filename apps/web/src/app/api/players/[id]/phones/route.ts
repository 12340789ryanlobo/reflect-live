// GET  /api/players/:id/phones        — list all phones for a player
// POST /api/players/:id/phones        — add a phone { e164, label?, is_primary? }
//
// Auth: caller must be active member of the player's team. Self-edit
// (the athlete's own linked player) and coach/platform-admin both
// allowed to read; only coach/admin OR the athlete themselves may
// write. Athletes are scoped to their own player row.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { toE164 } from '@/lib/phone';

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
  return { ok: true, ctx: { team_id: player.team_id, isCoach, isPlatformAdmin, isSelf } };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const gate = await authorize(playerId);
  if (!gate.ok) return gate.res;

  const sb = serviceClient();
  const { data, error } = await sb
    .from('player_phones')
    .select('id, e164, label, is_primary, created_at')
    .eq('player_id', playerId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ phones: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const gate = await authorize(playerId);
  if (!gate.ok) return gate.res;
  // Write gate: coach, platform admin, or the athlete themselves.
  if (!gate.ctx.isCoach && !gate.ctx.isPlatformAdmin && !gate.ctx.isSelf) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { e164?: unknown; label?: unknown; is_primary?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const e164 = typeof body.e164 === 'string' ? toE164(body.e164) : null;
  if (!e164) return NextResponse.json({ error: 'bad_e164' }, { status: 400 });
  const labelRaw = typeof body.label === 'string' ? body.label.trim() : '';
  const label = labelRaw.length === 0 ? null : labelRaw.slice(0, 40);
  const wantsPrimary = body.is_primary === true;

  const sb = serviceClient();

  // If this is the player's first phone, force primary regardless of the
  // request — there's nothing else to fall back to.
  const { count: existingCount } = await sb
    .from('player_phones')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId);
  const willBePrimary = wantsPrimary || (existingCount ?? 0) === 0;

  // Promote-then-insert: if we're inserting a new primary, demote the
  // current primary first so the unique partial index doesn't trip.
  if (willBePrimary) {
    const { error: demoteErr } = await sb
      .from('player_phones')
      .update({ is_primary: false })
      .eq('player_id', playerId)
      .eq('is_primary', true);
    if (demoteErr) return NextResponse.json({ error: 'demote_failed', detail: demoteErr.message }, { status: 500 });
  }

  const { data: row, error } = await sb
    .from('player_phones')
    .insert({ player_id: playerId, e164, label, is_primary: willBePrimary })
    .select('id, e164, label, is_primary, created_at')
    .single();
  if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });

  // Mirror primary back to players.phone_e164 (denormalized cache).
  if (willBePrimary) {
    await sb.from('players').update({ phone_e164: e164 }).eq('id', playerId);
  }

  return NextResponse.json({ ok: true, phone: row });
}
