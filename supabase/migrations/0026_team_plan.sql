-- Adds a `plan` column to `teams` for the stub billing layer.
-- Three tiers (free / team / program) defined in
-- apps/web/src/lib/billing-plans.ts. No actual feature gating happens
-- on the server yet — this column is metadata + UI surface only,
-- read by /pricing, /dashboard/billing, and the admin teams pane so
-- the demo can show monetization shape without any payment infra.
--
-- Defaults all existing teams to 'free'. Future migration will add
-- plan_meta jsonb (Stripe customer id, current_period_end, etc.)
-- once a real customer signs.

alter table teams
  add column if not exists plan text not null default 'free'
  check (plan in ('free', 'team', 'program'));

-- Index isn't needed yet (rarely filtered on); add it later if the
-- admin dashboard ever paginates by plan.

comment on column teams.plan is
  'Subscription tier — free | team | program. Read-only metadata for now; no server-side feature gating attached.';
