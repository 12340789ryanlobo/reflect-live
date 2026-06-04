// GET /api/sms-bridge/allowed-kinds?phone=+E164
//
// Phone-keyed variant of /api/teams/[id]/allowed-kinds. Lives here
// because reflect (FastAPI / SQLite) and reflect-live (Next.js /
// Supabase) maintain independent teams.id values — the same team can
// be id=4 in one DB and id=1 in the other. Reflect's webhook can't
// reliably pass its own team_id and have reflect-live resolve to the
// right competition. Passing the phone (which IS consistent across
// both DBs) lets reflect-live look up its OWN team_id from the player
// record and skip the misalignment entirely.
//
// Public read — no auth. Same threat model as /api/teams/[id]/allowed-kinds
// (just kind names). Listed in proxy.ts isPublicApi.

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const BASELINE = ['workout', 'rehab'] as const;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const phone = url.searchParams.get('phone');
  if (!phone || !/^\+\d{6,15}$/.test(phone)) {
    return NextResponse.json({ error: 'phone_invalid' }, { status: 400 });
  }

  const sb = serviceClient();

  const { data: player, error: playerErr } = await sb
    .from('players')
    .select('team_id')
    .eq('phone_e164', phone)
    .maybeSingle<{ team_id: number }>();
  if (playerErr) {
    return NextResponse.json({ error: 'player_lookup_failed', detail: playerErr.message }, { status: 500 });
  }

  // Unknown phone — fall back to baseline so reflect at least accepts
  // workout/rehab. Reflect will then hit its own "we couldn't find
  // your account" branch when it tries to save.
  if (!player) {
    return NextResponse.json({ kinds: [...BASELINE] });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from('competitions')
    .select('scoring')
    .eq('team_id', player.team_id)
    .is('archived_at', null)
    .lte('starts_at', today)
    .gte('ends_at', today);
  if (error) {
    return NextResponse.json({ error: 'lookup_failed', detail: error.message }, { status: 500 });
  }

  const kinds = new Set<string>(BASELINE);
  for (const row of (data ?? []) as Array<{ scoring: Record<string, unknown> | null }>) {
    for (const key of Object.keys(row.scoring ?? {})) {
      const k = key.trim().toLowerCase();
      if (/^[a-z][a-z0-9_-]{0,31}$/.test(k)) kinds.add(k);
    }
  }

  return NextResponse.json(
    { kinds: [...kinds].sort() },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
  );
}
