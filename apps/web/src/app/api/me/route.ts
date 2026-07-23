// DELETE /api/me — self-service account deletion.
//
// Mirrors the admin path at DELETE /api/users (same cascade order
// + Clerk-last sequencing) but auth = the caller themselves. Used
// by the Danger Zone section on /dashboard/settings.
//
// Player roster rows are intentionally preserved — they're team
// data, not per-account data; the user can re-link later via a
// fresh /onboarding flow.

import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { serviceClient } from '@/lib/supabase-server';

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = serviceClient();

  // Child rows first; matches the admin DELETE /api/users cascade.
  const { error: memErr } = await sb.from('team_memberships').delete().eq('clerk_user_id', userId);
  if (memErr) return NextResponse.json({ error: `team_memberships: ${memErr.message}` }, { status: 500 });

  const { error: phErr } = await sb.from('phone_verifications').delete().eq('clerk_user_id', userId);
  if (phErr) return NextResponse.json({ error: `phone_verifications: ${phErr.message}` }, { status: 500 });

  const { error: prefErr } = await sb.from('user_preferences').delete().eq('clerk_user_id', userId);
  if (prefErr) return NextResponse.json({ error: `user_preferences: ${prefErr.message}` }, { status: 500 });

  // Clerk last — if DB cleanup partially fails, the auth row stays
  // intact so the user can retry. Reversing this order would leave
  // dangling rows tied to a deleted Clerk id (worse).
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch (e) {
    return NextResponse.json(
      { error: `clerk delete failed (DB rows already removed): ${(e as Error).message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
