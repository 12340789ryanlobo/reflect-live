-- 0029: per-team configurable competitions.
--
-- Replaces (without removing) the single-competition slot baked into
-- `teams.scoring_json` + `teams.competition_start_date`. A team can
-- now have any number of competitions — overlapping, sequential, or
-- archived — each with its own date range, kind→points scoring map,
-- and stacking-bonus rules.
--
-- Coexistence: if a team has no competitions row, the leaderboard
-- falls back to the legacy `teams.scoring_json` + `competition_start_date`
-- (so nothing breaks for existing teams). The first time a coach
-- creates a competition, the new path takes over.

create table if not exists competitions (
  id           bigserial primary key,
  team_id      bigint not null references teams(id),
  name         text not null,
  starts_at    date not null,
  ends_at      date not null,

  -- kind→points map. Open-ended so coaches can introduce any activity
  -- kind their team logs (swim, workout, rehab, lift, throw, etc.) at
  -- whatever weight makes sense. Empty {} is valid (a competition
  -- before scoring is configured); the aggregator returns zero rows.
  --
  -- Example: { "swim": 2, "workout": 1, "rehab": 0.6 }
  scoring      jsonb not null default '{}'::jsonb,

  -- Per-day stacking adjustments. Applied once per (player, day) where
  -- count(kind in entries) >= min_per_day. bonus_points is SIGNED:
  -- positive rewards stacking, negative discourages it. Coaches stack
  -- multiple rules for tiered effects (>=2 swims → -1, >=3 swims → -1
  -- gives 3 swims a -2 total adjustment).
  --
  -- Shape: [{ "kind": "swim", "min_per_day": 2, "bonus_points": -1 }]
  bonus_rules  jsonb not null default '[]'::jsonb,

  created_by   text not null,     -- clerk_user_id of the coach who created it
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,       -- soft-delete; nullable. archived rows hidden from leaderboards.

  -- Date sanity: ends_at must be on or after starts_at. Allows a
  -- one-day competition (starts = ends).
  constraint competitions_dates_ordered check (ends_at >= starts_at)
);

create index if not exists competitions_team_active_idx
  on competitions (team_id, archived_at, ends_at desc)
  where archived_at is null;

comment on table competitions is
  'Per-team configurable competitions. Multiple competitions allowed per team (overlapping OK). Coaches edit scoring + bonus_rules to model their own internal challenges.';
comment on column competitions.scoring is
  'kind->points map. e.g. { "swim": 2, "workout": 1, "rehab": 0.6 }. Empty {} is valid.';
comment on column competitions.bonus_rules is
  'Stacking adjustments applied once per (player, day). Each rule: { kind, min_per_day, bonus_points }. bonus_points is signed (positive = reward stacking, negative = discourage).';

-- RLS: anyone on the team can read; only coaches / admins can write.
-- Read policy mirrors `teams_via_memberships` from migration 0025.
alter table competitions enable row level security;

create policy "competitions readable to team members"
  on competitions for select
  using (
    team_id in (
      select team_id from team_memberships
      where clerk_user_id = (auth.jwt() ->> 'sub')
        and status = 'active'
    )
  );

-- Writes go through the service-role client in our API routes, so we
-- don't need a permissive write policy — RLS denies anon/auth writes
-- by default once RLS is enabled. The API routes enforce coach/admin
-- auth themselves.
