// PATCH /api/teams/:id   — admin: freeze, unfreeze, approve pending team
// DELETE /api/teams/:id  — admin: hard delete (cascades RLS-protected)
//
// Per-id endpoint complements /api/teams (GET list + POST create). The
// status transitions live here so the route signature stays simple
// (one body verb per request).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin } from '@/lib/admin-guard';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: { action?: unknown; plan?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const action = body.action;
  const sb = serviceClient();

  // Plan-flip path. Separate from the freeze/approve/reset actions so
  // we don't conflate billing state with creation_status state. Body:
  // { action: 'set_plan', plan: 'free' | 'team' | 'program' }.
  if (action === 'set_plan') {
    const plan = body.plan;
    if (plan !== 'free' && plan !== 'team' && plan !== 'program') {
      return NextResponse.json({ error: 'bad_plan' }, { status: 400 });
    }
    const { data, error } = await sb
      .from('teams')
      .update({ plan })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, team: data });
  }

  let nextStatus: 'pending' | 'active' | 'suspended';
  if (action === 'freeze') nextStatus = 'suspended';
  else if (action === 'unfreeze' || action === 'approve') nextStatus = 'active';
  else if (action === 'reset_pending') nextStatus = 'pending';
  else return NextResponse.json({ error: 'bad_action' }, { status: 400 });

  const { data, error } = await sb
    .from('teams')
    .update({ creation_status: nextStatus })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, team: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const sb = serviceClient();
  // Defensive: deleting a team will fail if memberships/sessions/etc reference
  // it (FK on referenced tables). For now we surface that error rather than
  // pre-cleaning, so admin sees something explicit and can decide.
  const { error } = await sb.from('teams').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
