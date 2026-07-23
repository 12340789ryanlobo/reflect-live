// /api/competitions/[id]
//
// GET    — competition row + computed leaderboard.
// PATCH  — coach: edit name / dates / scoring / bonus_rules / archived_at.
// DELETE — coach: hard-delete (mostly for typos right after create;
//          archive is the normal "stop running this" path via PATCH).

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { computeCompetitionLeaderboard } from '@/lib/scoring';
import type { Competition } from '@reflect-live/shared';
import { validateScoring, validateBonusRules, crossCheckBonusKinds } from '@/lib/competition-validate';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function loadCompetitionAndGate(id: number, requireWrite: boolean) {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const;
  const sb = serviceClient();
  const { data: comp } = await sb.from('competitions').select('*').eq('id', id).maybeSingle<Competition>();
  if (!comp) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const;

  const { data: prefs } = await sb
    .from('user_preferences')
    .select('is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean | null }>();
  const isAdmin = prefs?.is_platform_admin === true;

  if (!isAdmin) {
    const { data: mem } = await sb
      .from('team_memberships')
      .select('role, status')
      .eq('clerk_user_id', userId)
      .eq('team_id', comp.team_id)
      .maybeSingle<{ role: string; status: string }>();
    if (mem?.status !== 'active') {
      return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) } as const;
    }
    if (requireWrite && mem.role !== 'coach') {
      return { error: NextResponse.json({ error: 'forbidden', detail: 'only coaches can edit competitions' }, { status: 403 }) } as const;
    }
  }

  return { sb, userId, comp };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const gate = await loadCompetitionAndGate(id, false);
  if ('error' in gate) return gate.error;
  const { sb, comp } = gate;

  let leaderboard: Awaited<ReturnType<typeof computeCompetitionLeaderboard>> = [];
  try {
    leaderboard = await computeCompetitionLeaderboard(sb, comp);
  } catch (e) {
    console.error('[competitions/:id] leaderboard compute failed:', (e as Error).message);
    // Return the competition row + an empty leaderboard so the page
    // can render the metadata even if the activity_logs read errored.
  }

  return NextResponse.json({ competition: comp, leaderboard });
}

interface PatchBody {
  name?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  scoring?: unknown;
  bonus_rules?: unknown;
  /** Send a string to archive, null to un-archive. */
  archived?: unknown;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: PatchBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const gate = await loadCompetitionAndGate(id, true);
  if ('error' in gate) return gate.error;
  const { sb, comp } = gate;

  const patch: Record<string, unknown> = {};

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name_invalid' }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  for (const field of ['starts_at', 'ends_at'] as const) {
    if (field in body) {
      if (typeof body[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body[field] as string)) {
        return NextResponse.json({ error: `${field}_invalid` }, { status: 400 });
      }
      patch[field] = body[field];
    }
  }
  // Deep-validate scoring/bonus_rules (matching POST), then cross-check bonus
  // kinds against the *effective* post-patch values so an edit can't leave the
  // competition inconsistent (a bonus rule pointing at an unscored kind).
  let effectiveScoring = (comp.scoring ?? {}) as Record<string, number>;
  let effectiveBonus = (comp.bonus_rules ?? []) as Array<{ kind: string }>;
  if ('scoring' in body) {
    const scoring = validateScoring(body.scoring);
    if ('error' in scoring) return NextResponse.json({ error: 'scoring_invalid', detail: scoring.error }, { status: 400 });
    patch.scoring = scoring;
    effectiveScoring = scoring;
  }
  if ('bonus_rules' in body) {
    const bonusRules = validateBonusRules(body.bonus_rules);
    if ('error' in bonusRules) return NextResponse.json({ error: 'bonus_rules_invalid', detail: bonusRules.error }, { status: 400 });
    patch.bonus_rules = bonusRules;
    effectiveBonus = bonusRules;
  }
  if ('scoring' in body || 'bonus_rules' in body) {
    const crossErr = crossCheckBonusKinds(effectiveScoring, effectiveBonus);
    if (crossErr) return NextResponse.json({ error: 'bonus_rule_kind_unscored', detail: crossErr }, { status: 400 });
  }
  if ('archived' in body) {
    patch.archived_at = body.archived ? new Date().toISOString() : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('competitions')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ competition: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const gate = await loadCompetitionAndGate(id, true);
  if ('error' in gate) return gate.error;
  const { sb } = gate;
  const { error } = await sb.from('competitions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
