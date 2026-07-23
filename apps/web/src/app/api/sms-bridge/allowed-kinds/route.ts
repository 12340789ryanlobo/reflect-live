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
// A phone is unique only per (team_id, phone_e164) — a multi-team athlete
// legitimately has one player row per team, so the same number resolves to
// several teams. Union the allowed kinds across all of them; never assume a
// single row. (A .maybeSingle() here 500'd reflect's webhook for those
// athletes, which then texted them "error processing your response".)
//
// Public read — no auth. Same threat model as /api/teams/[id]/allowed-kinds
// (just kind names). Listed in proxy.ts isPublicApi.

import { serviceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { BASELINE_KINDS, computeAllowedKinds } from '@/lib/allowed-kinds';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const phone = url.searchParams.get('phone');
  if (!phone || !/^\+\d{6,15}$/.test(phone)) {
    return NextResponse.json({ error: 'phone_invalid' }, { status: 400 });
  }

  const sb = serviceClient();

  const { data: players, error: playerErr } = await sb
    .from('players')
    .select('team_id')
    .eq('phone_e164', phone);
  if (playerErr) {
    return NextResponse.json({ error: 'player_lookup_failed', detail: playerErr.message }, { status: 500 });
  }

  const teamIds = [...new Set(((players ?? []) as Array<{ team_id: number }>).map((p) => p.team_id))];

  // Unknown phone — fall back to baseline so reflect at least accepts
  // workout/rehab. Reflect will then hit its own "we couldn't find
  // your account" branch when it tries to save.
  if (teamIds.length === 0) {
    return NextResponse.json({ kinds: [...BASELINE_KINDS] });
  }

  const kinds = new Set<string>(BASELINE_KINDS);
  try {
    for (const teamId of teamIds) {
      for (const k of await computeAllowedKinds(sb, teamId)) kinds.add(k);
    }
  } catch (e) {
    return NextResponse.json(
      { error: 'lookup_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const extras = [...kinds]
    .filter((k) => !BASELINE_KINDS.includes(k as (typeof BASELINE_KINDS)[number]))
    .sort();
  return NextResponse.json(
    { kinds: [...BASELINE_KINDS, ...extras] },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
  );
}
