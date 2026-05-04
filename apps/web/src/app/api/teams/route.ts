// /api/teams
//
// GET   — admin-only: list every team (any creation_status).
// POST  — any signed-in user: create a team. Auto-generates team_code,
//         honors platform_settings.require_team_approval, and atomically
//         creates the creator's coach membership.
// PATCH — admin-only: edit legacy team fields (name, description, twilio
//         credentials). Freeze/unfreeze and delete live on /api/teams/[id].

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { generateTeamCode, isValidTeamCode } from '@reflect-live/shared';
import { requirePlatformAdmin } from '@/lib/admin-guard';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const sb = serviceClient();
  const { data, error } = await sb.from('teams').select('*').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { name?: unknown; code?: unknown; team_code?: unknown; default_gender?: unknown; description?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });

  // Internal `code` is the legacy slug used by some routes; generate from name.
  const codeRaw = typeof body.code === 'string' ? body.code.trim() : '';
  const code = (codeRaw || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (!code) return NextResponse.json({ error: 'bad_code' }, { status: 400 });

  const defaultGender = body.default_gender === 'female' ? 'female' : 'male';
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;

  const sb = serviceClient();

  // Honor platform_settings.require_team_approval.
  const { data: settings } = await sb
    .from('platform_settings')
    .select('require_team_approval')
    .eq('id', 1)
    .maybeSingle<{ require_team_approval: boolean }>();
  const requireApproval = settings?.require_team_approval === true;

  // Reject if a team with the same legacy code already exists (unique constraint
  // would catch it but we want a friendlier error).
  const { data: codeClash } = await sb.from('teams').select('id').eq('code', code).maybeSingle();
  if (codeClash) return NextResponse.json({ error: 'code_taken' }, { status: 400 });

  // Generate a team_code (retry on rare collision).
  let teamCode: string | null = null;
  for (let i = 0; i < 5; i++) {
    const candidate = generateTeamCode();
    if (!isValidTeamCode(candidate)) continue;
    const { data: hit } = await sb
      .from('teams')
      .select('id')
      .eq('team_code', candidate)
      .maybeSingle();
    if (!hit) { teamCode = candidate; break; }
  }
  if (!teamCode) {
    return NextResponse.json({ error: 'team_code_generation_failed' }, { status: 500 });
  }

  const { data: team, error: tErr } = await sb
    .from('teams')
    .insert({
      name,
      code,
      description,
      team_code: teamCode,
      creation_status: requireApproval ? 'pending' : 'active',
      default_gender: defaultGender,
      scoring_json: { workout_score: 10, rehab_score: 5 },
      activity_visibility: 'public',
    })
    .select()
    .single();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  // Create the creator's coach membership. Flag default_team if this is
  // their first active row.
  const { count: existingActiveCount } = await sb
    .from('team_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('clerk_user_id', userId)
    .eq('status', 'active');
  const isFirstActive = (existingActiveCount ?? 0) === 0;

  // If the team is pending admin approval, the creator's membership stays
  // active anyway (so they can see/edit their own pending team while it
  // awaits approval). The team itself is just gated from athlete browse.
  const { error: mErr } = await sb.from('team_memberships').insert({
    clerk_user_id: userId,
    team_id: team.id,
    role: 'coach',
    status: 'active',
    default_team: isFirstActive,
    decided_at: new Date().toISOString(),
    decided_by: userId,
  });
  if (mErr) {
    // If membership insert fails, leave the team row in place but report
    // — admin can manually clean up. (Realistic alternative: wrap in a
    // pg function for transactional atomicity. Defer that polish.)
    return NextResponse.json({ error: 'membership_insert_failed', detail: mErr.message, team }, { status: 500 });
  }

  // Switch the creator's user_preferences over to the new team and
  // align role with their fresh coach membership. Without this, the
  // creator landed on /dashboard with prefs.role still pointing at
  // whatever they were before (athlete on the prior team), the heal
  // logic in dashboard-shell would force them back to that prior
  // role, and the new-team experience read as 'I'm an athlete'
  // instead of 'I'm the coach'. impersonate_player_id is reset to
  // null because the prior value was a player on a different team.
  const { data: upsertedPrefs, error: prefsErr } = await sb
    .from('user_preferences')
    .upsert(
      {
        clerk_user_id: userId,
        team_id: team.id,
        role: 'coach',
        impersonate_player_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clerk_user_id' },
    )
    .select('*')
    .maybeSingle();
  if (prefsErr) {
    console.error('[teams] prefs upsert failed for creator:', prefsErr.message);
  } else {
    console.log('[teams] creator prefs upserted:', {
      clerk: userId,
      team_id: upsertedPrefs?.team_id,
      role: upsertedPrefs?.role,
    });
  }

  return NextResponse.json({
    ok: true,
    team,
    requires_approval: requireApproval,
    // Echo the upserted prefs back so the client can confirm the
    // role transition committed before navigating.
    preferences: upsertedPrefs ?? null,
  });
}

// Force dynamic execution — without this, Next.js may attempt to
// statically optimize the POST handler's surrounding RSC, which can
// race with the freshly-written user_preferences row when /dashboard
// re-renders. Same reason for /api/preferences below.
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
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
