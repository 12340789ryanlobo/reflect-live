// PATCH: mark resolved (or unresolve)
// DELETE: hard delete (kept simple — coach/admin only; reports aren't a
// privileged dataset and "delete" is the natural verb for "I logged this
// by accident")
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

async function authorize(userId: string | null) {
  if (!userId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const sb = serviceClient();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('team_id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref) return { error: NextResponse.json({ error: 'no_team' }, { status: 403 }) };
  return { sb, pref };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  const ctx = await authorize(userId);
  if ('error' in ctx) return ctx.error;
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: { resolved?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const update = { resolved_at: body.resolved === false ? null : new Date().toISOString() };
  const { error } = await ctx.sb
    .from('injury_reports')
    .update(update)
    .eq('id', id)
    .eq('team_id', ctx.pref.team_id);
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  const ctx = await authorize(userId);
  if ('error' in ctx) return ctx.error;
  const role = (ctx.pref.role ?? 'coach') as string;
  if (role !== 'coach' && role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const { error } = await ctx.sb.from('injury_reports').delete().eq('id', id).eq('team_id', ctx.pref.team_id);
  if (error) return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
