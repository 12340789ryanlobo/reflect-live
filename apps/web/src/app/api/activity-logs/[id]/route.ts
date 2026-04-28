// apps/web/src/app/api/activity-logs/[id]/route.ts
//
// Soft-hide an activity_logs row. Used by coaches/admins to suppress
// mistake uploads. Hidden rows survive worker/backfill re-runs because the
// dual-write upsert is idempotent on source_sid.

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('team_id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref) return NextResponse.json({ error: 'no_team' }, { status: 403 });

  const role = (pref.role ?? 'coach') as string;
  if (role !== 'coach' && role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { error } = await sb
    .from('activity_logs')
    .update({ hidden: true })
    .eq('id', id)
    .eq('team_id', pref.team_id);

  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
