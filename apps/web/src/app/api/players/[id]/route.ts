/**
 * PATCH/DELETE /api/players/[id]
 *
 * Admin-only roster management. Delete cascades to:
 *   - user_preferences.impersonate_player_id → nulled
 *   - twilio_messages.player_id → nulled (messages stay, orphaned)
 *   - activity_logs rows → deleted (strict FK, can't null)
 *
 * PATCH allows editing name / group / phone_e164 / active.
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

async function requireAdmin(): Promise<{ ok: true; teamId: number } | { ok: false; res: NextResponse }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const sb = serviceClient();
  const { data } = await sb.from('user_preferences').select('role,team_id').eq('clerk_user_id', userId).maybeSingle();
  if (data?.role !== 'admin') return { ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { ok: true, teamId: data.team_id as number };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const allowed = ['name', 'group', 'phone_e164', 'active', 'gender'];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  // Gender domain check
  if ('gender' in patch && patch.gender !== null && patch.gender !== 'male' && patch.gender !== 'female') {
    return NextResponse.json({ error: 'bad_gender' }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const sb = serviceClient();
  const { data: existing } = await sb.from('players').select('team_id').eq('id', playerId).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.team_id !== gate.teamId) return NextResponse.json({ error: 'cross-team edit forbidden' }, { status: 403 });

  const { error } = await sb.from('players').update(patch).eq('id', playerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
