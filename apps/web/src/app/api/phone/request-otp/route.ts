/**
 * POST /api/phone/request-otp
 * Body: { phone: string }
 *
 * Generates a 6-digit code, stores a time-limited row in phone_verifications,
 * and SMSes the code via Twilio. Rate-limited to 1 send / 60s per user+phone.
 */

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getTwilioConfigForTeam, sendSms, toE164 } from '@/lib/twilio-sms';
import { randomInt } from 'node:crypto';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const phone = toE164(String(body.phone ?? ''));
  if (!phone) return NextResponse.json({ error: 'invalid_phone', message: 'Enter a valid phone number (with country code).' }, { status: 400 });

  const sb = serviceClient();

  const { data: prefs } = await sb.from('user_preferences').select('team_id').eq('clerk_user_id', userId).maybeSingle();
  if (!prefs) return NextResponse.json({ error: 'no_prefs', message: 'Complete onboarding first.' }, { status: 400 });

  // Rate limit: 1 SMS per 60s per user+phone
  const { data: recent } = await sb
    .from('phone_verifications')
    .select('created_at')
    .eq('clerk_user_id', userId)
    .eq('phone_e164', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.created_at) {
    const ageMs = Date.now() - new Date(recent.created_at).getTime();
    if (ageMs < 60_000) {
      const wait = Math.ceil((60_000 - ageMs) / 1000);
      return NextResponse.json({ error: 'rate_limited', message: `Wait ${wait}s before requesting another code.` }, { status: 429 });
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const { error: insErr } = await sb.from('phone_verifications').insert({
    clerk_user_id: userId,
    team_id: prefs.team_id,
    phone_e164: phone,
    code,
    expires_at,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  try {
    const cfg = await getTwilioConfigForTeam(sb, prefs.team_id);
    await sendSms(cfg, phone, `Your reflect-live verification code is ${code}. It expires in 10 minutes.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send SMS.';
    return NextResponse.json({ error: 'sms_failed', message: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true, phone });
}
