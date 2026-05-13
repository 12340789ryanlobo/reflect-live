# Full Freemium / Billing Stack — Design Spec

**Date:** 2026-05-13
**Author:** Ryan Lobo
**Status:** draft — pending implementation
**Goal:** turn the stub billing layer (free / team / program plans defined in `lib/billing-plans.ts`) into a real self-service freemium → paid funnel with checkout, subscription management, and feature gating, while keeping signup low-friction.

## Current state

- **Plans defined:** `apps/web/src/lib/billing-plans.ts` — Starter (free), Team ($600/season), Program ($1,500/season). Feature matrix, athlete limits, plan names + taglines.
- **Schema:** `teams.plan` column (enum free | team | program, default free) via migration 0026. No Stripe-related columns yet.
- **Surfaces:**
  - `/pricing` (public) — 3-column tier cards with mailto CTAs.
  - `/dashboard/billing` (in-app) — current plan card + feature matrix + mailto upgrade CTA.
  - `/dashboard/admin/teams` — admin plan dropdown that PATCHes `set_plan` action.
- **Auth:** Clerk (Google OAuth + email). Onboarding flow lands users in a team via OTP or invite.
- **Free tier:** everything works out of the box. No server-side feature gating exists yet (the `hasFeature()` helper is defined but not called anywhere).
- **LLM cost concern:** Phase-5 player summaries use GPT-4 via the `llm_cache` table with throttle. Free-tier teams currently can burn through OpenAI credits at our expense. Highest-priority feature to gate once payment lands.

## Target state

- **Self-serve upgrade** from `/dashboard/billing` and `/pricing` — one click → Stripe checkout → land back in app with new plan active within ~30s.
- **Self-serve downgrade / cancel** via Stripe Customer Portal, embedded in `/dashboard/billing` for paid teams.
- **Webhook-driven plan sync** — `teams.plan` always reflects Stripe subscription state. No manual reconciliation.
- **Two payment paths:**
  1. **Card checkout** (default) — coach pays with personal/department credit card. ~2 min from "Upgrade" click to active subscription.
  2. **Invoice / PO option** for athletic departments. Stripe natively supports `payment_method_types: ['us_bank_account', 'card']` and invoice-only checkout sessions. Coach requests an invoice → Stripe emails it → AD pays via ACH or check → subscription activates on receipt.
- **Server-side feature gates** on costly endpoints — LLM briefings, AI assistant, scheduled sends. Free users get a graceful 402 + upgrade prompt instead of silent denial.
- **Trial period** — 14-day free trial on the Team plan. No card required to start the trial; reverts to Starter if no card on file at expiry.
- **Receipts + dunning** — Stripe sends emails natively. Failed-payment retries (smart retries) handled in dashboard.
- **Tax** — Stripe Tax enabled for US state nexus. Skipped initially (no nexus until ~$100k revenue in most states); can flip on later.

## Architecture

```
[ Coach clicks Upgrade ]
        ↓
POST /api/billing/checkout
  → creates Stripe Checkout Session
  → returns session URL
        ↓
[ Stripe-hosted checkout page ]
  → user enters card / requests invoice
        ↓
[ Stripe webhook: checkout.session.completed ]
        ↓
POST /api/billing/webhook
  → verify signature with STRIPE_WEBHOOK_SECRET
  → look up team_id from session metadata
  → update teams.plan + teams.stripe_customer_id + teams.stripe_subscription_id
  → upsert a row in subscription_events (audit trail)
        ↓
[ User lands on /dashboard/billing?status=success ]
  → sees new plan card, feature matrix updated, "Manage subscription" button
        ↓
[ Going forward ]
  → customer.subscription.updated → sync plan + period_end
  → customer.subscription.deleted → revert teams.plan to 'free'
  → invoice.payment_failed → email + in-app banner
```

## Phased rollout

Five small phases. Each one ships independently — the app keeps working at every checkpoint, just with progressively more capability.

### Phase 1 — Stripe foundations (~1 hr)

**Schema (migration 0027):**

```sql
alter table teams
  add column if not exists stripe_customer_id   text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_renews_at       timestamptz,
  add column if not exists plan_status          text not null default 'active'
    check (plan_status in ('active','trialing','past_due','canceled','incomplete'));

create table if not exists subscription_events (
  id           bigserial primary key,
  team_id      bigint not null references teams(id) on delete cascade,
  stripe_event_id text not null unique,  -- dedup on Stripe's event id
  event_type   text not null,            -- 'checkout.session.completed' etc.
  payload      jsonb not null,
  created_at   timestamptz not null default now()
);
```

**Stripe Dashboard setup (manual, in Stripe UI):**
- Create products: `Team Plan`, `Program Plan`.
- Create prices: $600/year for Team, $1,500/year for Program. Recurring, billed annually.
- Save the price IDs into env: `STRIPE_PRICE_TEAM`, `STRIPE_PRICE_PROGRAM`.
- Configure Customer Portal (Settings → Customer portal): allow plan switching, cancellation, invoice access.

**Env vars to add (Vercel + local `.env.local`):**

```
STRIPE_SECRET_KEY=sk_test_...   (then sk_live_... for prod)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_TEAM=price_...
STRIPE_PRICE_PROGRAM=price_...
```

**Dependencies:**

```bash
cd apps/web && bun add stripe
```

### Phase 2 — Checkout flow (~2 hr)

**New endpoint:** `POST /api/billing/checkout`
- Auth: admin or coach on the team.
- Body: `{ plan: 'team' | 'program', invoiceMode?: boolean }`
- Creates a Stripe Checkout Session with `client_reference_id = team_id` and `metadata = { team_id, plan }`.
- For `invoiceMode: true`, sets `payment_method_types: ['us_bank_account']` + `customer_creation: 'always'` and emails the invoice.
- Returns `{ url: session.url }` for the client to redirect.

**New endpoint:** `POST /api/billing/webhook`
- No auth — verified via `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`.
- Handle events:
  - `checkout.session.completed` → set `teams.plan` from session.metadata, write subscription IDs.
  - `customer.subscription.updated` → sync `plan` + `plan_status` + `plan_renews_at`.
  - `customer.subscription.deleted` → revert to `plan='free'`, `plan_status='canceled'`.
  - `invoice.payment_failed` → set `plan_status='past_due'`, send email (Stripe handles natively).
- Idempotent on `subscription_events.stripe_event_id` (dedup).

**Client-side change:** `/pricing` and `/dashboard/billing` "Upgrade" buttons → call `POST /api/billing/checkout`, redirect to returned URL. Mailto fallback stays only for the Program tier "Talk to us" path.

**Test checklist:**
- Free tier user clicks Upgrade → lands on Stripe → completes test card `4242 4242 4242 4242` → webhook fires → DB updated → user lands on `/dashboard/billing?status=success` → plan badge shows Team.
- Webhook idempotency: re-fire the same event via Stripe CLI → no duplicate DB write.
- Cancel mid-checkout → lands on `/dashboard/billing?status=cancelled` → plan unchanged.

### Phase 3 — Customer Portal (~30 min)

**New endpoint:** `POST /api/billing/portal`
- Auth: admin or coach on a paid team.
- Looks up `teams.stripe_customer_id`, calls `stripe.billingPortal.sessions.create({ customer, return_url: '/dashboard/billing' })`.
- Returns `{ url }`.

**Client-side change:** `/dashboard/billing` shows a "Manage subscription" button for paid teams that POSTs and redirects.

### Phase 4 — Feature gates (~1 hr)

**Server-side enforcement** on three endpoints initially:
1. `POST /api/players/[id]/summary` (LLM briefing) — require `team.plan` has `llmBriefings`.
2. `/api/sessions` POST (scheduled sends) — require `team.plan` has `scheduledSends`.
3. AI assistant route (when Phase 4 of the v3 plan lands) — require `team.plan` has `aiAssistant`.

**Gate pattern (helper):**

```ts
// apps/web/src/lib/feature-gate.ts
import { PLANS, type PlanFeatures } from '@/lib/billing-plans';

export async function requireFeature(
  teamId: number,
  feature: keyof PlanFeatures,
  sb: SupabaseClient,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const { data: team } = await sb.from('teams').select('plan').eq('id', teamId).maybeSingle();
  const plan = resolvePlan(team?.plan);
  if (!PLANS[plan].features[feature]) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'plan_required', feature, current_plan: plan },
        { status: 402 },
      ),
    };
  }
  return { ok: true };
}
```

**Client-side fallback:** wherever an LLM/AI feature renders, check the plan and show an `<UpgradePrompt>` chip instead of the feature when locked. Style: subtle dashed border, "Upgrade to Team to unlock" link to `/dashboard/billing`.

### Phase 5 — Trial + polish (~1 hr)

- **14-day trial on Team plan:** Stripe Checkout supports `subscription_data.trial_period_days: 14`. New users land in `plan='team'`, `plan_status='trialing'`. At trial end Stripe automatically tries the saved card OR (if no card) cancels the subscription, webhook flips us back to `plan='free'`.
- **No-card trial:** Stripe Checkout has a `payment_method_collection: 'if_required'` flag that lets users start the trial without entering a card. Card collection happens just before trial-end via Stripe email + portal link.
- **In-app trial banner** on `/dashboard` and `/dashboard/billing`: "Trial: 9 days left · Add card to keep Team features". Dismissible per session.
- **Receipt + renewal emails:** enabled in Stripe Dashboard → Emails. Free for the project.
- **Failed-payment dunning:** Stripe's Smart Retries (Dashboard → Settings → Subscriptions). Free.
- **Pricing-page CTA update:** `mailto:` links → `POST /api/billing/checkout` for Team + Starter signup; Program stays as `mailto:` (enterprise) until we see real D-I demand.

## Open questions

1. **Pricing display on /pricing for guests:** currently the Starter "Get started free" button goes to `mailto:`. Should it go straight to `/sign-up`? Yes — friction-free start. Switch.
2. **What happens if a user creates a team while on the free tier and the team's plan is `free` but they immediately upgrade?** Easy: the upgrade flow takes effect for the team they're currently active on; multi-team users can upgrade each team independently.
3. **Annual-only vs. monthly?** Annual matches academic budget cycles. Monthly adds complexity for negligible benefit at this stage. Annual only.
4. **Refunds:** Stripe portal handles user-initiated cancels (refund pro-rated to remaining period). Manual refunds happen via Stripe Dashboard. Don't build a UI for it.
5. **Tax:** Skip Stripe Tax for now (no nexus). Re-evaluate at first $50k revenue.

## Test plan

After each phase, the following must still work:
- Free-tier signup → onboarding → dashboard renders → can send SMS surveys → can view inbound messages.
- Existing UChicago Men's + Women's teams unaffected (their plan stays whatever it currently is in DB).
- All ~70 unit tests pass.
- Vercel deploy is healthy.

Phase-specific tests added inline above.

## Rollback strategy

Each phase is one PR. Phase failures:
- **Phase 1 (schema)** — column adds are backward-compatible; no rollback needed.
- **Phase 2 (checkout)** — if webhook is broken, manually fire the same DB update from the Stripe Dashboard. The "Upgrade" button can be feature-flagged off.
- **Phase 3 (portal)** — no enforcement; rolling back just removes the button.
- **Phase 4 (gates)** — gate enforcement is one helper; flip the helper to always-allow to disable.
- **Phase 5 (trial)** — change `trial_period_days: 14` → `0` and the trial is gone.
