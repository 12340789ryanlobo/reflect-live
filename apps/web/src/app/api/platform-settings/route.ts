// GET  /api/platform-settings — admin: read singleton config
// PATCH /api/platform-settings — admin: update the toggle(s)
//
// Currently only require_team_approval. Future toggles can land here
// without route churn.

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

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const sb = serviceClient();
  const { data, error } = await sb
    .from('platform_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PATCH(req: NextRequest) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  let body: { require_team_approval?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const update: Record<string, unknown> = {};
  if (typeof body.require_team_approval === 'boolean') {
    update.require_team_approval = body.require_team_approval;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data, error } = await sb
    .from('platform_settings')
    .update(update)
    .eq('id', 1)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data });
}
