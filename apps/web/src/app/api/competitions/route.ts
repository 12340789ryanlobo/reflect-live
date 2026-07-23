// /api/competitions
//
// GET  ?team_id=N — list active+archived competitions for a team.
//                   Read access: any active member of the team.
// POST              — create a new competition.
//                   Write access: active 'coach' on the team OR platform admin.
//
// Bonus rules are intentionally accepted as free-form arrays so the
// schema can evolve without API churn; we validate the shape inline.

import { auth } from '@clerk/nextjs/server';
import { serviceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { validateScoring, validateBonusRules, crossCheckBonusKinds } from '@/lib/competition-validate';

async function requireTeamReader(teamId: number) {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const;
  const sb = serviceClient();
  const { data: prefs } = await sb
    .from('user_preferences')
    .select('is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean | null }>();
  if (prefs?.is_platform_admin) return { sb, userId, role: 'admin' as const };
  const { data: mem } = await sb
    .from('team_memberships')
    .select('role, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle<{ role: string; status: string }>();
  if (mem?.status === 'active') return { sb, userId, role: mem.role };
  return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) } as const;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const teamId = Number(url.searchParams.get('team_id'));
  if (!Number.isInteger(teamId)) {
    return NextResponse.json({ error: 'team_id required' }, { status: 400 });
  }
  const gate = await requireTeamReader(teamId);
  if ('error' in gate) return gate.error;
  const { sb } = gate;

  const { data, error } = await sb
    .from('competitions')
    .select('*')
    .eq('team_id', teamId)
    .order('starts_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ competitions: data ?? [] });
}

interface CreateBody {
  team_id?: unknown;
  name?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  scoring?: unknown;
  bonus_rules?: unknown;
}

export async function POST(req: Request) {
  let body: CreateBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const teamId = Number(body.team_id);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });

  const gate = await requireTeamReader(teamId);
  if ('error' in gate) return gate.error;
  if (gate.role !== 'coach' && gate.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden', detail: 'only team coaches or platform admins can create competitions' }, { status: 403 });
  }
  const { sb, userId } = gate;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });

  // Dates: accept ISO YYYY-MM-DD strings. The DB column is `date`, so we
  // pass them through directly after a sanity-shape check.
  const startsAt = typeof body.starts_at === 'string' ? body.starts_at : '';
  const endsAt = typeof body.ends_at === 'string' ? body.ends_at : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsAt) || !/^\d{4}-\d{2}-\d{2}$/.test(endsAt)) {
    return NextResponse.json({ error: 'dates_invalid', detail: 'starts_at and ends_at must be YYYY-MM-DD' }, { status: 400 });
  }
  if (endsAt < startsAt) {
    return NextResponse.json({ error: 'date_range_invalid', detail: 'ends_at must be on or after starts_at' }, { status: 400 });
  }

  const scoring = validateScoring(body.scoring);
  if ('error' in scoring) return NextResponse.json({ error: 'scoring_invalid', detail: scoring.error }, { status: 400 });
  const bonusRules = validateBonusRules(body.bonus_rules);
  if ('error' in bonusRules) return NextResponse.json({ error: 'bonus_rules_invalid', detail: bonusRules.error }, { status: 400 });

  // Cross-validate: every kind referenced in bonus_rules must carry points in
  // scoring, else the rule silently no-ops — surface the likely typo on save.
  const crossErr = crossCheckBonusKinds(scoring, bonusRules);
  if (crossErr) return NextResponse.json({ error: 'bonus_rule_kind_unscored', detail: crossErr }, { status: 400 });

  const { data, error } = await sb
    .from('competitions')
    .insert({
      team_id: teamId,
      name,
      starts_at: startsAt,
      ends_at: endsAt,
      scoring,
      bonus_rules: bonusRules,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ competition: data });
}

export const dynamic = 'force-dynamic';
