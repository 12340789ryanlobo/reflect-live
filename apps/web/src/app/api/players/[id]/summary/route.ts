// POST /api/players/:id/summary?days=14
//
// Generates an LLM (or rules-based fallback) summary for a single player.
// Auth:
//   - Caller must be active member of the player's team, OR
//   - Caller is a platform admin.
// Cache:
//   - Keyed on (player_id, days, hash(responses+flags)) — repeat calls
//     within the cache TTL re-use the stored response.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import {
  generatePlayerSummary,
  generateCacheKey,
  hashSummaryInputs,
  type ResponseRow,
  type FlagRow,
  type SummaryResult,
} from '@/lib/player-summary';
import { parsePeriod, periodSinceIso } from '@/lib/period';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const playerId = Number(idStr);
  if (!Number.isInteger(playerId)) return NextResponse.json({ error: 'bad_player_id' }, { status: 400 });

  const url = new URL(req.url);
  const days = parsePeriod(url.searchParams.get('days'));

  const sb = serviceClient();

  const { data: player } = await sb
    .from('players')
    .select('id, team_id, name')
    .eq('id', playerId)
    .maybeSingle<{ id: number; team_id: number; name: string }>();
  if (!player) return NextResponse.json({ error: 'player_not_found' }, { status: 404 });

  const [{ data: mem }, { data: prefs }] = await Promise.all([
    sb.from('team_memberships')
      .select('status, role')
      .eq('clerk_user_id', userId)
      .eq('team_id', player.team_id)
      .maybeSingle<{ status: string; role: string }>(),
    sb.from('user_preferences')
      .select('is_platform_admin')
      .eq('clerk_user_id', userId)
      .maybeSingle<{ is_platform_admin: boolean }>(),
  ]);
  const isMember = mem?.status === 'active';
  const isPlatformAdmin = prefs?.is_platform_admin === true;
  if (!isMember && !isPlatformAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const sinceIso = periodSinceIso(days);

  const responseQ = sb
    .from('responses')
    .select('session_id, question_id, answer_raw, answer_num, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: true })
    .limit(500);
  const flagQ = sb
    .from('flags')
    .select('flag_type, severity, details, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(50);

  const [{ data: respRows }, { data: flagRows }] = await Promise.all([
    sinceIso ? responseQ.gte('created_at', sinceIso) : responseQ,
    sinceIso ? flagQ.gte('created_at', sinceIso) : flagQ,
  ]);

  const responses = (respRows ?? []) as ResponseRow[];
  const flags = (flagRows ?? []) as FlagRow[];

  const dataHash = hashSummaryInputs(responses, flags);
  const cacheKey = generateCacheKey(playerId, days, dataHash);

  // Cache lookup.
  const { data: cached } = await sb
    .from('llm_cache')
    .select('response')
    .eq('cache_key', cacheKey)
    .maybeSingle<{ response: SummaryResult }>();
  if (cached?.response) {
    return NextResponse.json({ ...cached.response, from_cache: true });
  }

  const result = await generatePlayerSummary({
    playerId,
    playerName: player.name,
    responses,
    flags,
    days,
  });

  // Write-through cache. Best-effort; don't block the response on a failure.
  await sb.from('llm_cache').upsert({
    cache_key: cacheKey,
    response: result,
    generated_by: result.generated_by,
  }, { onConflict: 'cache_key' });

  return NextResponse.json(result);
}
