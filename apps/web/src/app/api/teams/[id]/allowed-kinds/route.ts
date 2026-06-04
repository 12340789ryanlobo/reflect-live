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

const BASELINE = ['workout', 'rehab'] as const;

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
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from('competitions')
    .select('scoring')
    .eq('team_id', teamId)
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
