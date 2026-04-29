// GET /api/teams/discover
// GET /api/teams/discover?code=xyz123
//
// Lists teams an athlete can request to join, or looks up a single
// team by its shareable team_code. Excludes teams with creation_status
// in ('pending','suspended'). Returns minimal info — name, code,
// description — so the browse list stays light.
//
// Auth: requires a Clerk-authenticated user (any role); no team
// scoping needed since this is the discovery surface.

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

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = serviceClient();
  const code = req.nextUrl.searchParams.get('code')?.trim().toLowerCase();

  if (code) {
    const { data, error } = await sb
      .from('teams')
      .select('id, name, code, description, team_code, default_gender')
      .eq('team_code', code)
      .eq('creation_status', 'active')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'team_not_found' }, { status: 404 });
    return NextResponse.json({ team: data });
  }

  const { data, error } = await sb
    .from('teams')
    .select('id, name, code, description, team_code, default_gender')
    .eq('creation_status', 'active')
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data ?? [] });
}
