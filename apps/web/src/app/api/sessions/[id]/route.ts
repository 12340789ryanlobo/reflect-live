// PATCH /api/sessions/:id  — rename label, set video_links, or restore.
// DELETE /api/sessions/:id — soft-delete (sets deleted_at). Coaches/admins.

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

async function authorize(userId: string) {
  const sb = serviceClient();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('team_id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref) return { error: 'no_team' as const };
  const role = (pref.role ?? 'coach') as string;
  if (!['coach', 'captain', 'admin'].includes(role)) return { error: 'forbidden' as const };
  return { sb, teamId: pref.team_id as number, role };
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const ok = await authorize(userId);
  if ('error' in ok) {
    return NextResponse.json({ error: ok.error }, { status: ok.error === 'no_team' ? 403 : 403 });
  }

  let body: { label?: unknown; video_links?: unknown; restore?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const update: Record<string, unknown> = {};
  if (typeof body.label === 'string') {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ error: 'label_required' }, { status: 400 });
    if (label.length > 200) return NextResponse.json({ error: 'label_too_long' }, { status: 400 });
    update.label = label;
  }
  if (body.video_links !== undefined) update.video_links_json = body.video_links ?? null;
  if (body.restore === true) update.deleted_at = null;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 });
  }

  const { data, error } = await ok.sb
    .from('sessions')
    .update(update)
    .eq('id', id)
    .eq('team_id', ok.teamId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, session: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const ok = await authorize(userId);
  if ('error' in ok) return NextResponse.json({ error: ok.error }, { status: 403 });

  const { error } = await ok.sb
    .from('sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('team_id', ok.teamId);
  if (error) return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
