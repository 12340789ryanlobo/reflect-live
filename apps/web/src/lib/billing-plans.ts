// Single source of truth for the three subscription tiers. Read by:
//   - /pricing (public landing-style page)
//   - /dashboard/billing (in-app current-plan view)
//   - /dashboard/admin/teams (admin plan-flip dropdown)
//
// The `features` matrix is metadata only right now — no server-side
// gate hangs off any of these flags. When the first paying customer
// signs we'll wire `hasFeature(team, 'llmBriefings')` into the routes
// that actually call OpenAI etc. so we stop paying for inference on
// free-tier teams.

export type Plan = 'free' | 'team' | 'program';

export interface PlanFeatures {
  /** Core dashboard, sidebar, athlete pages — always true. */
  coreDashboard: boolean;
  /** Inbound SMS/WhatsApp surfacing in timeline + activity feed. */
  smsInbound: boolean;
  /** Outbound scheduled survey sends + reminders. */
  scheduledSends: boolean;
  /** Per-metric Score-trends heatmap on the dashboard + athlete page. */
  scoreTrends: boolean;
  /** Body-region heatmap (front + back muscle silhouettes). */
  bodyHeatmap: boolean;
  /** GPT-generated per-athlete briefings on the player detail page. */
  llmBriefings: boolean;
  /** AI chat assistant ('ask the team' Q&A). */
  aiAssistant: boolean;
  /** Multi-team admin pooling (cross-team reports + admin pane). */
  multiTeamAdmin: boolean;
  /** Priority email support — purely a marketing feature. */
  prioritySupport: boolean;
}

export interface PlanDef {
  id: Plan;
  name: string;
  /** Annual price in USD. 0 for free tier. */
  pricePerSeason: number;
  /** Helpful for display ("$60 / month, billed annually"). */
  pricePerMonth: number;
  /** Max athletes the plan covers. null = unlimited. */
  athleteLimit: number | null;
  /** One-line marketing tagline shown on /pricing under the tier name. */
  tagline: string;
  /** Bulleted feature highlights surfaced on /pricing — these are
   *  marketing copy, not the features matrix. */
  highlights: string[];
  /** Best-for blurb under the tier name. */
  bestFor: string;
  features: PlanFeatures;
}

const FREE_FEATURES: PlanFeatures = {
  coreDashboard: true,
  smsInbound: true,
  scheduledSends: false,
  scoreTrends: true,
  bodyHeatmap: false,
  llmBriefings: false,
  aiAssistant: false,
  multiTeamAdmin: false,
  prioritySupport: false,
};

const TEAM_FEATURES: PlanFeatures = {
  ...FREE_FEATURES,
  scheduledSends: true,
  bodyHeatmap: true,
  llmBriefings: true,
};

const PROGRAM_FEATURES: PlanFeatures = {
  ...TEAM_FEATURES,
  aiAssistant: true,
  multiTeamAdmin: true,
  prioritySupport: true,
};

export const PLANS: Record<Plan, PlanDef> = {
  free: {
    id: 'free',
    name: 'Starter',
    pricePerSeason: 0,
    pricePerMonth: 0,
    athleteLimit: 12,
    tagline: 'Free for small teams',
    bestFor: 'Coaches trying it out, club teams, small rosters',
    highlights: [
      'Dashboard + activity feed',
      'Inbound SMS/WhatsApp tagging',
      'Score trends per metric',
      'Up to 12 athletes',
    ],
    features: FREE_FEATURES,
  },
  team: {
    id: 'team',
    name: 'Team',
    pricePerSeason: 600,
    pricePerMonth: 60,
    athleteLimit: 30,
    tagline: 'Everything a single team needs',
    bestFor: 'NCAA D-III / D-II rosters, high-school programs',
    highlights: [
      'Everything in Starter',
      'Body-region pain heatmap',
      'Scheduled surveys + reminders',
      'LLM athlete briefings',
      'Up to 30 athletes',
    ],
    features: TEAM_FEATURES,
  },
  program: {
    id: 'program',
    name: 'Program',
    pricePerSeason: 1500,
    pricePerMonth: 125,
    athleteLimit: null,
    tagline: 'Multi-team athletic departments',
    bestFor: 'D-I programs, multi-sport athletic departments',
    highlights: [
      'Everything in Team',
      'AI chat assistant',
      'Cross-team admin + analytics',
      'Unlimited athletes & teams',
      'Priority support',
    ],
    features: PROGRAM_FEATURES,
  },
};

export const PLAN_ORDER: Plan[] = ['free', 'team', 'program'];

/** Resolve a Plan from a free-form string with a graceful fallback.
 *  Used everywhere we read `team.plan` from the DB so a missing column
 *  (migration not yet applied) doesn't crash the page — we just treat
 *  every team as 'free' until the migration lands. */
export function resolvePlan(raw: string | null | undefined): Plan {
  if (raw === 'team') return 'team';
  if (raw === 'program') return 'program';
  return 'free';
}

/** True when the feature is included in the team's plan. Right now no
 *  server route actually calls this; it's exported so we can flip a
 *  hard gate on once we have a paying customer. */
export function hasFeature(plan: Plan, feature: keyof PlanFeatures): boolean {
  return PLANS[plan].features[feature];
}

/** Display string: "$600 / season" or "Free". */
export function formatPrice(plan: PlanDef): string {
  if (plan.pricePerSeason === 0) return 'Free';
  return `$${plan.pricePerSeason.toLocaleString()} / season`;
}
