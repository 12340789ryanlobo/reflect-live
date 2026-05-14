// Authorization helper for billing routes. A user may initiate a
// checkout / portal session for a team only if they are an active
// coach/admin member of that team, OR a platform admin. Returns a
// concrete team row on success so callers don't need to re-query.
//
// Membership role 'coach' is the billing decision-maker. Athletes
// can be members of paid teams but can't change the subscription.

import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export type TeamBillingRow = {
  id: number;
  name: string;
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_status: string;
};

export type BillingGuardResult =
  | { ok: true; userId: string; team: TeamBillingRow; sb: SupabaseClient }
  | { ok: false; response: NextResponse };

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function requireBillingActor(teamId: number): Promise<BillingGuardResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (!Number.isInteger(teamId)) {
    return { ok: false, response: NextResponse.json({ error: 'bad_team_id' }, { status: 400 }) };
  }
  const sb = serviceClient();

  const { data: team, error: tErr } = await sb
    .from('teams')
    .select('id, name, plan, stripe_customer_id, stripe_subscription_id, plan_status')
    .eq('id', teamId)
    .maybeSingle<TeamBillingRow>();
  if (tErr) {
    return { ok: false, response: NextResponse.json({ error: tErr.message }, { status: 500 }) };
  }
  if (!team) {
    return { ok: false, response: NextResponse.json({ error: 'team_not_found' }, { status: 404 }) };
  }

  // Platform admins can manage any team's billing (support workflow).
  const { data: prefs } = await sb
    .from('user_preferences')
    .select('is_platform_admin, role')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean | null; role: string | null }>();
  const isPlatformAdmin = prefs?.is_platform_admin === true || prefs?.role === 'admin';

  if (!isPlatformAdmin) {
    const { data: m } = await sb
      .from('team_memberships')
      .select('role, status')
      .eq('clerk_user_id', userId)
      .eq('team_id', teamId)
      .maybeSingle<{ role: string; status: string }>();
    const isCoach = m?.status === 'active' && m?.role === 'coach';
    if (!isCoach) {
      return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
    }
  }

  return { ok: true, userId, team, sb };
}
