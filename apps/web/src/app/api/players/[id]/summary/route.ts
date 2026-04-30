// POST /api/players/:id/summary?days=14
//
// Generates an LLM (or rules-based fallback) summary for a single player.
// Auth:
//   - Caller must be active member of the player's team, OR
//   - Caller is a platform admin.
// Cache (two layers):
//   - exact: (player_id, days, hash(responses+flags)) — same inputs.
//   - throttle: (player_id, days) within LLM_CACHE_TTL_HOURS (default 24h).
//   - ?force=1 bypasses both.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import {
  generatePlayerSummary,
  generateCacheKey,
  hashSummaryInputs,
  type ResponseRow,
  type FlagRow,
  type ActivityLogRow,
  type InjuryRow,
  type TwilioMessageRow,
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
  const logQ = sb
    .from('activity_logs')
    .select('kind, description, logged_at, hidden')
    .eq('player_id', playerId)
    .order('logged_at', { ascending: false })
    .limit(200);
  const injQ = sb
    .from('injury_reports')
    .select('regions, severity, description, reported_at, resolved_at')
    .eq('player_id', playerId)
    .order('reported_at', { ascending: false })
    .limit(50);
  const msgQ = sb
    .from('twilio_messages')
    .select('direction, category, body, date_sent')
    .eq('player_id', playerId)
    .order('date_sent', { ascending: false })
    .limit(200);

  const [
    { data: respRows },
    { data: flagRows },
    { data: logRows },
    { data: injRows },
    { data: msgRows },
  ] = await Promise.all([
    sinceIso ? responseQ.gte('created_at', sinceIso) : responseQ,
    sinceIso ? flagQ.gte('created_at', sinceIso) : flagQ,
    sinceIso ? logQ.gte('logged_at', sinceIso) : logQ,
    sinceIso ? injQ.gte('reported_at', sinceIso) : injQ,
    sinceIso ? msgQ.gte('date_sent', sinceIso) : msgQ,
  ]);

  const responses = (respRows ?? []) as ResponseRow[];
  const flags = (flagRows ?? []) as FlagRow[];
  const activityLogs = (logRows ?? []) as ActivityLogRow[];
  const injuries = (injRows ?? []) as InjuryRow[];
  const messages = (msgRows ?? []) as TwilioMessageRow[];

  const dataHash = hashSummaryInputs(responses, flags, activityLogs, injuries, messages);
  const cacheKey = generateCacheKey(playerId, days, dataHash);
  const throttleKey = `player:${playerId}:days:${days}`;

  const force = url.searchParams.get('force') === '1';
  const parsedTtl = Number(process.env.LLM_CACHE_TTL_HOURS);
  const ttlHours = Number.isFinite(parsedTtl) && parsedTtl >= 0 ? parsedTtl : 24;
  const ttlMs = ttlHours * 3600 * 1000;

  // Lookup unless force-regen.
  if (!force) {
    // (1) Exact key match — same inputs, free.
    const { data: exact } = await sb
      .from('llm_cache')
      .select('response, created_at')
      .eq('cache_key', cacheKey)
      .maybeSingle<{ response: SummaryResult; created_at: string }>();
    if (exact?.response) {
      return NextResponse.json({
        ...exact.response,
        from_cache: true,
        cached_at: exact.created_at,
      });
    }

    // (2) TTL throttle — most-recent (player, period) within window.
    if (ttlMs > 0) {
      const ttlCutoffIso = new Date(Date.now() - ttlMs).toISOString();
      const { data: throttled } = await sb
        .from('llm_cache')
        .select('response, created_at')
        .eq('throttle_key', throttleKey)
        .gte('created_at', ttlCutoffIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ response: SummaryResult; created_at: string }>();
      if (throttled?.response) {
        return NextResponse.json({
          ...throttled.response,
          from_cache: true,
          cached_at: throttled.created_at,
        });
      }
    }
  }

  const result = await generatePlayerSummary({
    playerName: player.name,
    responses,
    flags,
    days,
    activityLogs,
    injuries,
    messages,
  });

  // Write-through cache, both keys. Skip on fallback so the next click
  // retries the LLM once it recovers.
  if (!result.error) {
    await sb.from('llm_cache').upsert(
      {
        cache_key: cacheKey,
        throttle_key: throttleKey,
        response: result,
        generated_by: result.generated_by,
      },
      { onConflict: 'cache_key' },
    );
  }

  // Echo cached_at on the fresh path too — the row was just upserted with
  // created_at = now(), so the UI's "Generated Xh ago" chip stays continuous.
  return NextResponse.json({ ...result, cached_at: new Date().toISOString() });
}
