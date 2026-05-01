// GET /api/twilio-media/:messageSid/:mediaSid
//
// Proxy that fetches an inbound MMS image from Twilio and streams it
// back to the browser. Twilio media URLs require Basic Auth (account
// SID + auth token), so they can't be loaded directly in <img> tags.
// We look up the message → team → team's twilio creds, then fetch
// from `https://api.twilio.com/.../Media/<sid>` which redirects to
// the actual S3 URL; we follow the redirect and stream bytes.
//
// Auth: caller must be active member of the team that owns the
// message (or platform admin). Otherwise leaking media across teams.
//
// Caching: response sets `Cache-Control: private, max-age=86400` so
// the browser keeps the image around for a day. Twilio retains
// messages ~30 days, so a long client cache + occasional 404 is
// the right tradeoff. Storage-bucket persistence is a follow-up.

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

function looksLikeSid(s: string, prefix: string): boolean {
  // Twilio SIDs are 34 chars: 2-char prefix + 32 hex. Loose check —
  // we don't need to be RFC-strict, just guard against path injection.
  return s.length === 34 && s.startsWith(prefix) && /^[A-Za-z0-9]+$/.test(s);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ messageSid: string; mediaSid: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { messageSid, mediaSid } = await ctx.params;
  if (!looksLikeSid(messageSid, 'MM') && !looksLikeSid(messageSid, 'SM')) {
    return NextResponse.json({ error: 'bad_message_sid' }, { status: 400 });
  }
  if (!looksLikeSid(mediaSid, 'ME')) {
    return NextResponse.json({ error: 'bad_media_sid' }, { status: 400 });
  }

  const sb = serviceClient();

  // Look up the message + team_id. media_sids array must include the
  // requested mediaSid — otherwise we'd be a free Twilio media proxy
  // for any well-formed SID pair the caller pastes.
  const { data: msg } = await sb
    .from('twilio_messages')
    .select('team_id, media_sids')
    .eq('sid', messageSid)
    .maybeSingle<{ team_id: number | null; media_sids: string[] | null }>();
  if (!msg) return NextResponse.json({ error: 'message_not_found' }, { status: 404 });
  if (!msg.media_sids || !msg.media_sids.includes(mediaSid)) {
    return NextResponse.json({ error: 'media_not_on_message' }, { status: 404 });
  }
  if (msg.team_id == null) {
    return NextResponse.json({ error: 'message_unscoped' }, { status: 404 });
  }

  // Auth: caller must be active on this team or platform admin.
  const [{ data: mem }, { data: prefs }] = await Promise.all([
    sb.from('team_memberships')
      .select('status')
      .eq('clerk_user_id', userId)
      .eq('team_id', msg.team_id)
      .maybeSingle<{ status: string }>(),
    sb.from('user_preferences')
      .select('is_platform_admin')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ is_platform_admin: boolean }>(),
  ]);
  if (mem?.status !== 'active' && prefs?.is_platform_admin !== true) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Pull team's Twilio creds. Fall back to env vars (the worker uses
  // those for the default team too).
  const { data: team } = await sb
    .from('teams')
    .select('twilio_account_sid, twilio_auth_token')
    .eq('id', msg.team_id)
    .maybeSingle<{ twilio_account_sid: string | null; twilio_auth_token: string | null }>();
  const accountSid = team?.twilio_account_sid ?? process.env.TWILIO_ACCOUNT_SID;
  const authToken = team?.twilio_auth_token ?? process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'twilio_credentials_missing' }, { status: 500 });
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}/Media/${mediaSid}`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const upstream = await fetch(url, {
    headers: { Authorization: `Basic ${basic}` },
    // Twilio's Media URL redirects to S3. fetch follows by default.
    redirect: 'follow',
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: 'twilio_fetch_failed', status: upstream.status },
      { status: 502 },
    );
  }
  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': contentType,
      // Twilio retains media ~30 days; cache aggressively in-browser
      // so paginating through past activity doesn't re-fetch every
      // thumbnail. private = don't let CDN cache (auth-scoped).
      'cache-control': 'private, max-age=86400',
    },
  });
}
