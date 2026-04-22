import { auth, clerkClient } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }), userId: null };
  const sb = serviceClient();
  const { data } = await sb.from('user_preferences').select('role').eq('clerk_user_id', userId).maybeSingle();
  if (data?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }), userId };
  }
  return { error: null, userId };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const sb = serviceClient();
  const { data: prefs } = await sb.from('user_preferences').select('*').order('created_at');
  const clerk = await clerkClient();

  const rows = await Promise.all(
    (prefs ?? []).map(async (p) => {
      try {
        const u = await clerk.users.getUser(p.clerk_user_id);
        return {
          clerk_user_id: p.clerk_user_id,
          email: u.emailAddresses?.[0]?.emailAddress ?? null,
          name: u.fullName ?? null,
          role: p.role ?? 'coach',
          impersonate_player_id: p.impersonate_player_id ?? null,
          group_filter: p.group_filter ?? null,
          created_at: p.created_at,
        };
      } catch {
        return {
          clerk_user_id: p.clerk_user_id,
          email: null,
          name: null,
          role: p.role ?? 'coach',
          impersonate_player_id: p.impersonate_player_id ?? null,
          group_filter: p.group_filter ?? null,
          created_at: p.created_at,
        };
      }
    }),
  );
  return NextResponse.json({ users: rows });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json();
  const { clerk_user_id, role } = body;
  if (!clerk_user_id || !['admin', 'coach', 'captain', 'athlete'].includes(role)) {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  }
  if (clerk_user_id === gate.userId && role !== 'admin') {
    return NextResponse.json({ error: 'cannot demote yourself — promote another admin first' }, { status: 400 });
  }

  const sb = serviceClient();
  const { error } = await sb.from('user_preferences').update({ role, updated_at: new Date().toISOString() }).eq('clerk_user_id', clerk_user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
