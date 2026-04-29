// Server-side helper. Resolves whether the calling Clerk user is a
// platform admin (is_platform_admin=true on user_preferences). Returns
// either the userId for downstream use, or a NextResponse error to
// short-circuit the route.
//
// Service-role Supabase client is created internally because callers
// don't need it before this check passes anyway.

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export type AdminGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requirePlatformAdmin(): Promise<AdminGuardResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await sb
    .from('user_preferences')
    .select('is_platform_admin, role')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean; role: string | null }>();
  // Also accept legacy role='admin' for backward compat during transition.
  const isAdmin = data?.is_platform_admin === true || data?.role === 'admin';
  if (!isAdmin) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId };
}
