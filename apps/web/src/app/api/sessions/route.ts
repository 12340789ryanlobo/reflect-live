// apps/web/src/app/api/sessions/route.ts
//
// POST: create a session (practice/match/lifting) for the user's team.
// Captains and coaches can create; athletes cannot. The session is created
// in shadow mode — no outbound texts go out until the worker's
// TWILIO_OUTBOUND_ENABLED flag flips. Until then the row is just a
// container that future scheduled_sends + deliveries hang off.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const SESSION_TYPES = ['practice', 'match', 'lifting'] as const;
type SessionType = (typeof SESSION_TYPES)[number];

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    type?: unknown;
    label?: unknown;
    template_id?: unknown;
    video_links?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const type = body.type as SessionType;
  if (!SESSION_TYPES.includes(type)) {
    return NextResponse.json({ error: 'bad_type' }, { status: 400 });
  }
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return NextResponse.json({ error: 'label_required' }, { status: 400 });
  if (label.length > 200) return NextResponse.json({ error: 'label_too_long' }, { status: 400 });

  const templateId =
    body.template_id == null ? null : Number(body.template_id);
  if (templateId !== null && !Number.isInteger(templateId)) {
    return NextResponse.json({ error: 'bad_template_id' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data: pref } = await sb
    .from('user_preferences')
    .select('team_id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!pref) return NextResponse.json({ error: 'no_team' }, { status: 403 });

  const role = (pref.role ?? 'coach') as string;
  if (!['coach', 'captain', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Ensure the template (if any) belongs to the same team.
  if (templateId !== null) {
    const { data: tmpl } = await sb
      .from('question_templates')
      .select('team_id')
      .eq('id', templateId)
      .maybeSingle();
    if (!tmpl || tmpl.team_id !== pref.team_id) {
      return NextResponse.json({ error: 'template_not_on_team' }, { status: 403 });
    }
  }

  const { data, error } = await sb
    .from('sessions')
    .insert({
      team_id: pref.team_id,
      type,
      label,
      template_id: templateId,
      video_links_json: body.video_links ?? null,
    })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, session: data });
}
