/**
 * POST /api/phone/verify-otp
 * Body: { phone: string, code: string }
 *
 * Validates the code against the most recent phone_verifications row for this
 * user+phone, marks it verified, and if the verified phone matches a player on
 * the user's team, links them via user_preferences.impersonate_player_id.
 *
 * The admin role is preserved (dual-role). Non-admin coaches / captains stay
 * in their role; regular unassigned users become 'athlete' when linked.
 */

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { toE164 } from '@/lib/twilio-sms';

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
  const code = String(body.code ?? '').replace(/\D/g, '').slice(0, 6);
  if (!phone || code.length !== 6) {
    return NextResponse.json({ error: 'invalid_input', message: 'Phone and 6-digit code required.' }, { status: 400 });
  }

  const sb = serviceClient();

  const { data: verification } = await sb
    .from('phone_verifications')
    .select('*')
    .eq('clerk_user_id', userId)
    .eq('phone_e164', phone)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!verification) {
    return NextResponse.json({ error: 'no_pending_code', message: 'Request a new code first.' }, { status: 400 });
  }

  if (new Date(verification.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired', message: 'That code expired. Request a new one.' }, { status: 400 });
  }

  if (verification.attempts >= 5) {
    return NextResponse.json({ error: 'too_many_attempts', message: 'Too many wrong attempts. Request a new code.' }, { status: 429 });
  }

  if (verification.code !== code) {
    await sb.from('phone_verifications').update({ attempts: verification.attempts + 1 }).eq('id', verification.id);
    return NextResponse.json({ error: 'wrong_code', message: 'That code didn’t match. Try again.' }, { status: 400 });
  }

  // Mark verified
  await sb.from('phone_verifications').update({ verified_at: new Date().toISOString() }).eq('id', verification.id);

  // Load prefs to preserve role
  const { data: prefs } = await sb.from('user_preferences').select('*').eq('clerk_user_id', userId).maybeSingle();
  if (!prefs) return NextResponse.json({ error: 'no_prefs' }, { status: 400 });

  // Match against the team's roster
  const { data: match } = await sb
    .from('players')
    .select('id,name,group,team_id')
    .eq('team_id', prefs.team_id)
    .eq('phone_e164', phone)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({
      ok: true,
      verified: true,
      linked: false,
      message: 'Phone verified, but it’s not on this team’s roster.',
    });
  }

  // Dual-role preserve
  const newRole = prefs.role === 'admin' || prefs.role === 'captain' || prefs.role === 'coach'
    ? prefs.role
    : 'athlete';

  const { error: upErr } = await sb.from('user_preferences').update({
    impersonate_player_id: match.id,
    role: newRole,
    updated_at: new Date().toISOString(),
  }).eq('clerk_user_id', userId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    verified: true,
    linked: true,
    player: { id: match.id, name: match.name, group: match.group },
    role: newRole,
  });
}
