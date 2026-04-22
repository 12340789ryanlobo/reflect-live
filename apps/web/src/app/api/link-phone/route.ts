/**
 * POST /api/link-phone
 *
 * Reads the signed-in user's **verified** phone numbers from Clerk, checks
 * each one against the team's `players.phone_e164` roster, and if a match is
 * found upserts `user_preferences.impersonate_player_id` for this user.
 *
 * Security model:
 *  - We only trust phones that Clerk reports as verified (Clerk's SMS OTP
 *    proved possession of the number).
 *  - We never accept a phone from the request body — the caller can't claim
 *    someone else's phone.
 *  - If multiple verified phones match different players, we fail safely
 *    rather than guess.
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function normalizePhone(raw: string): string {
  // Strip whatsapp:/sms: schemes and whitespace, keep leading '+'.
  return raw.replace(/^(whatsapp|sms):/i, '').replace(/[^\d+]/g, '').trim();
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Only consider phones Clerk has verified via SMS OTP
  const verifiedPhones = (user.phoneNumbers ?? [])
    .filter((p) => p.verification?.status === 'verified')
    .map((p) => normalizePhone(p.phoneNumber));

  if (verifiedPhones.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'no_verified_phone',
      message: 'Add a phone number in your profile and verify it via SMS first.',
    });
  }

  const sb = serviceClient();

  // Load the user's current prefs (to preserve role + existing team_id)
  const { data: prefs } = await sb.from('user_preferences').select('*').eq('clerk_user_id', userId).maybeSingle();
  if (!prefs) return NextResponse.json({ error: 'no user_preferences row — complete onboarding first' }, { status: 400 });

  // Look up players on the same team by any of the verified phones
  const { data: matches, error } = await sb
    .from('players')
    .select('id,name,phone_e164,group,team_id')
    .eq('team_id', prefs.team_id)
    .in('phone_e164', verifiedPhones);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!matches || matches.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'no_match',
      message: 'Your verified phone isn’t on this team’s roster. Ask the admin to add you.',
      phones: verifiedPhones,
    });
  }
  if (matches.length > 1) {
    return NextResponse.json({
      ok: false,
      reason: 'ambiguous',
      message: 'More than one verified phone matches a different swimmer. Remove one and try again.',
    });
  }

  const player = matches[0];

  // Preserve admin role (dual-role: admin AND linked athlete).
  // For non-admin coaches that aren’t already captains, mark them as 'athlete'
  // so their default dashboard scopes to themselves. Admins keep admin nav
  // plus gain a "My athlete view" link via impersonate_player_id.
  const newRole = prefs.role === 'admin' || prefs.role === 'captain' ? prefs.role : 'athlete';

  const { error: upErr } = await sb.from('user_preferences').update({
    impersonate_player_id: player.id,
    role: newRole,
    updated_at: new Date().toISOString(),
  }).eq('clerk_user_id', userId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    player: { id: player.id, name: player.name, group: player.group },
    role: newRole,
  });
}
