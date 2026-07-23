// Server-side billing enforcement. Costly / paid-tier endpoints call
// requireFeature() before doing real work so free-tier teams get a
// clean 402 + upgrade hint instead of silently consuming a paid
// feature (LLM inference, scheduled outbound sends). Mirrors the
// discriminated-union shape of requireBillingActor in billing-guard.ts:
// returns a result, never throws.
//
// The 402 body is the contract the client <UpgradePrompt> reads:
//   { error: 'plan_required', feature, current_plan, required_plan }

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PLANS,
  PLAN_ORDER,
  resolvePlan,
  type Plan,
  type PlanFeatures,
} from '@/lib/billing-plans';

export type FeatureGateResult =
  | { ok: true; plan: Plan }
  | { ok: false; response: NextResponse };

/** Lowest-priced plan whose feature matrix includes `feature` — the
 *  plan we point the user at to unlock it. Falls back to 'program' (the
 *  superset) if somehow no plan carries the feature. */
function minPlanFor(feature: keyof PlanFeatures): Plan {
  for (const p of PLAN_ORDER) if (PLANS[p].features[feature]) return p;
  return 'program';
}

export async function requireFeature(
  teamId: number,
  feature: keyof PlanFeatures,
  sb: SupabaseClient,
): Promise<FeatureGateResult> {
  const { data: team, error } = await sb
    .from('teams')
    .select('plan')
    .eq('id', teamId)
    .maybeSingle<{ plan: string | null }>();
  if (error) {
    // Don't silently downgrade a paying team to 'free' (→ a wrong 402) on a
    // transient read failure — surface a 500 so the client can retry.
    return {
      ok: false,
      response: NextResponse.json({ error: 'plan_lookup_failed' }, { status: 500 }),
    };
  }
  const plan = resolvePlan(team?.plan);
  if (!PLANS[plan].features[feature]) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'plan_required', feature, current_plan: plan, required_plan: minPlanFor(feature) },
        { status: 402 },
      ),
    };
  }
  return { ok: true, plan };
}
