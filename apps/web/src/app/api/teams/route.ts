import { auth } from '@clerk/nextjs/server';
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
  if (!userId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const sb = serviceClient();
  const { data } = await sb.from('user_preferences').select('role').eq('clerk_user_id', userId).maybeSingle();
  if (data?.role !== 'admin') return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { error: null as null };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const sb = serviceClient();
  const { data, error } = await sb.from('teams').select('*').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const body = await req.json();
  const { name, code, description = null } = body;
  if (!name || !code) return NextResponse.json({ error: 'name and code required' }, { status: 400 });
  const sb = serviceClient();
  const { data, error } = await sb.from('teams').insert({ name, code, description }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team: data });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const body = await req.json();
  const { id, ...patch } = body;
  if (typeof id !== 'number') return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sb = serviceClient();
  const allowed = ['name', 'description', 'twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number'];
  const filtered: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) filtered[k] = patch[k];
  const { error } = await sb.from('teams').update(filtered).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
