-- Phase 1 of the freemium billing stack — adds Stripe sync fields to
-- `teams` and creates `subscription_events` as the idempotent audit
-- log for webhook delivery. See
-- docs/superpowers/specs/2026-05-13-billing-stack.md for the full
-- design.
--
-- All `teams` additions are nullable / defaulted, so existing rows
-- (every team in production is currently on 'free') stay valid
-- without backfill. The `plan_status` column is the one piece that
-- changes the shape of every row — defaults to 'active' so the
-- existing 'free' rows read as "active free plan" rather than
-- needing UPDATEs.

alter table teams
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_renews_at         timestamptz,
  add column if not exists plan_status            text not null default 'active'
    check (plan_status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete'));

comment on column teams.stripe_customer_id is
  'Stripe Customer id (cus_…). Set by webhook on first checkout.session.completed; reused for Customer Portal sessions and subsequent subscription edits.';
comment on column teams.stripe_subscription_id is
  'Active Stripe Subscription id (sub_…). NULL while on free plan or between cancel and next checkout.';
comment on column teams.plan_renews_at is
  'Mirror of subscription.current_period_end. Read-only for UI ("renews in 23 days"); single source of truth lives in Stripe.';
comment on column teams.plan_status is
  'Mirror of Stripe subscription status. Drives banners (trial countdown, past-due notice). "active" for free-plan teams (they are not in dunning).';

-- One row per Stripe webhook delivery. `stripe_event_id` is unique so
-- a retried webhook is a no-op (the upsert sees the conflict and
-- skips the side-effects in code). `payload` is the full event for
-- audit/replay; `team_id` is denormalized for easy filtering when
-- debugging a single team's billing history.
create table if not exists subscription_events (
  id              bigserial primary key,
  team_id         bigint references teams(id) on delete set null,
  stripe_event_id text not null unique,
  event_type      text not null,
  payload         jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists subscription_events_team_id_idx
  on subscription_events (team_id, created_at desc);

comment on table subscription_events is
  'Audit log of Stripe webhook events. Idempotency anchor — handler upserts by stripe_event_id and skips re-processing.';

-- No RLS on subscription_events: only the service-role webhook
-- handler writes to it, and only admins read it (via the admin
-- billing surface, which already uses the service-role client).
