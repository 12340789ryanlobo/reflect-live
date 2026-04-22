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

async function computeInitialRole(userEmail: string | undefined): Promise<'admin' | 'coach'> {
  const bootstrap = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').toLowerCase().trim();
  if (bootstrap && userEmail && userEmail.toLowerCase() === bootstrap) return 'admin';
  const sb = serviceClient();
  const { count } = await sb.from('user_preferences').select('clerk_user_id', { count: 'exact', head: true });
  if ((count ?? 0) === 0) return 'admin'; // first user becomes admin
  return 'coach';
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { team_id, watchlist = [], group_filter = null, role = null, impersonate_player_id = null } = body;
  if (typeof team_id !== 'number') return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const sb = serviceClient();
  const { data: existing } = await sb.from('user_preferences').select('clerk_user_id,role').eq('clerk_user_id', userId).maybeSingle();

  let effectiveRole: string | null = role;
  // Only admin can change role; non-admin requests silently preserve existing role
  if (existing && existing.role !== 'admin' && role !== null && existing.role !== role) {
    effectiveRole = existing.role ?? 'coach';
  }
  if (!existing) {
    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress;
    effectiveRole = await computeInitialRole(email);
  }

  const payload: Record<string, unknown> = {
    clerk_user_id: userId,
    team_id,
    watchlist,
    group_filter,
    updated_at: new Date().toISOString(),
  };
  if (effectiveRole !== null) payload.role = effectiveRole;
  if (impersonate_player_id !== null || (existing && existing.role === 'admin')) {
    payload.impersonate_player_id = impersonate_player_id;
  }

  const { error } = await sb.from('user_preferences').upsert(payload, { onConflict: 'clerk_user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, role: effectiveRole });
}
