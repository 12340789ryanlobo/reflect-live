// apps/web/src/app/api/sessions/route.ts
//
// POST: create a session (practice/match/lifting) for the user's team.
// Captains and coaches can create; athletes cannot.
//
// When a scheduled_at is supplied we also queue the corresponding
// scheduled_sends row in the same request — that's the "least-friction"
// flow the dashboard offers: pick when the survey goes out and we'll
// handle the rest. We stay in shadow mode regardless: the worker only
// flips would-be sends to actual sends once TWILIO_OUTBOUND_ENABLED=true.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const SESSION_TYPES = ['practice', 'match', 'lifting'] as const;
type SessionType = (typeof SESSION_TYPES)[number];

const CHANNELS = ['whatsapp', 'sms'] as const;
type Channel = (typeof CHANNELS)[number];

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
    scheduled_at?: unknown;
    channel?: unknown;
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

  let scheduledAt: string | null = null;
  if (body.scheduled_at !== undefined && body.scheduled_at !== null && body.scheduled_at !== '') {
    const d = new Date(String(body.scheduled_at));
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'bad_scheduled_at' }, { status: 400 });
    }
    scheduledAt = d.toISOString();
  }
  const channel: Channel =
    body.channel === 'sms' ? 'sms' : 'whatsapp';
  if (body.channel !== undefined && !CHANNELS.includes(body.channel as Channel)) {
    return NextResponse.json({ error: 'bad_channel' }, { status: 400 });
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

  const { data: session, error } = await sb
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

  // If the coach picked a scheduled time, queue the send. Stays pending
  // until the worker scheduler (3f) lands.
  let scheduled_send: unknown = null;
  if (scheduledAt) {
    const { data: ss, error: ssErr } = await sb
      .from('scheduled_sends')
      .insert({
        session_id: session.id,
        scheduled_at: scheduledAt,
        channel,
        status: 'pending',
      })
      .select()
      .single();
    if (ssErr) {
      return NextResponse.json(
        { error: 'session_created_but_schedule_failed', detail: ssErr.message, session },
        { status: 500 },
      );
    }
    scheduled_send = ss;
  }

  return NextResponse.json({ ok: true, session, scheduled_send });
}
