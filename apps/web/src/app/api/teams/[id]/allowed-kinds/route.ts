// GET /api/teams/[id]/allowed-kinds
//
// Returns the set of activity-log prefixes the reflect FastAPI webhook
// should accept for this team. Computed as the baseline {workout, rehab}
// unioned with the scoring-map keys of every currently-active competition
// (today between starts_at and ends_at, not archived). Coaches edit
// competition scoring in the dashboard; reflect picks the new kinds up
// automatically without a redeploy.
//
// Public read — no auth. The data is the same kind list the leaderboard
// already exposes to anyone on the team, and reflect is server-side so
// Clerk session auth would be a poor fit. If we later need rate-limiting
// or service-to-service auth, add a shared bearer here.

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { computeAllowedKinds } from '@/lib/allowed-kinds';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return NextResponse.json({ error: 'team_id_invalid' }, { status: 400 });
  }

  const sb = serviceClient();
  let kinds: string[];
  try {
    kinds = await computeAllowedKinds(sb, teamId);
  } catch (e) {
    return NextResponse.json(
      { error: 'lookup_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { kinds },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
  );
}
