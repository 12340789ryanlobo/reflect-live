-- Phase 1a — membership foundation.
--
-- Adds team_memberships (single source of truth for who's on which team
-- in what role and status), platform_settings (one-row global config),
-- and extends teams + user_preferences with the columns sub-1's flows
-- read. Backfills existing user_preferences as memberships and seeds a
-- team_code on every existing team.
--
-- Idempotent: re-running this migration is a no-op once it has been
-- applied. Safe to apply on dev or prod.

-- ==========================================================================
-- 1. team_memberships — primary membership table
-- ==========================================================================
create table if not exists team_memberships (
  clerk_user_id   text       not null,
  team_id         bigint     not null references teams(id),
  player_id       bigint     references players(id) on delete set null,
  role            text       not null default 'athlete'
                  check (role in ('athlete','captain','coach')),
  status          text       not null
                  check (status in (
                    'requested','invited','active','denied','left','removed'
                  )),
  default_team    boolean    not null default false,
  requested_name  text,
  requested_email text,
  requested_at    timestamptz default now(),
  decided_at      timestamptz,
  decided_by      text,
  deny_reason     text,
  primary key (clerk_user_id, team_id)
);

create unique index if not exists uq_one_default_per_user
  on team_memberships(clerk_user_id) where default_team;

create index if not exists idx_memberships_team_pending
  on team_memberships(team_id, requested_at desc) where status = 'requested';

create index if not exists idx_memberships_user_active
  on team_memberships(clerk_user_id) where status = 'active';

-- ==========================================================================
-- 2. teams extensions
-- ==========================================================================
alter table teams add column if not exists team_code text;
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where indexname = 'uq_teams_team_code'
  ) then
    create unique index uq_teams_team_code on teams(team_code) where team_code is not null;
  end if;
end$$;

alter table teams add column if not exists creation_status text not null default 'active'
  check (creation_status in ('pending','active','suspended'));

alter table teams add column if not exists activity_visibility text not null default 'public'
  check (activity_visibility in ('public','coaches_only'));

-- ==========================================================================
-- 3. user_preferences extension
-- ==========================================================================
alter table user_preferences add column if not exists
  is_platform_admin boolean not null default false;

-- ==========================================================================
-- 4. platform_settings — single-row global config
-- ==========================================================================
create table if not exists platform_settings (
  id int primary key default 1 check (id = 1),
  require_team_approval boolean not null default false
);
insert into platform_settings (id) values (1) on conflict (id) do nothing;

-- ==========================================================================
-- 5. RLS — read scoping for team_memberships
-- ==========================================================================
alter table team_memberships enable row level security;

-- Users see their own membership rows (any status — they need to see
-- pending requests they've made).
drop policy if exists memberships_self_read on team_memberships;
create policy memberships_self_read on team_memberships
  for select using (clerk_user_id = (auth.jwt() ->> 'sub'));

-- Coaches and captains see all rows on their team — to manage requests
-- and view the roster.
drop policy if exists memberships_team_managers_read on team_memberships;
create policy memberships_team_managers_read on team_memberships
  for select using (
    team_id in (
      select team_id from team_memberships
      where clerk_user_id = (auth.jwt() ->> 'sub')
        and status = 'active'
        and role in ('coach','captain')
    )
  );

-- Platform admins see everything.
drop policy if exists memberships_platform_admin_read on team_memberships;
create policy memberships_platform_admin_read on team_memberships
  for select using (
    exists (
      select 1 from user_preferences
      where clerk_user_id = (auth.jwt() ->> 'sub')
        and is_platform_admin = true
    )
  );

-- All writes go through the service-role API. No client-side write policies.

alter table platform_settings enable row level security;
drop policy if exists platform_settings_admin_read on platform_settings;
create policy platform_settings_admin_read on platform_settings
  for select using (
    exists (
      select 1 from user_preferences
      where clerk_user_id = (auth.jwt() ->> 'sub')
        and is_platform_admin = true
    )
  );

-- ==========================================================================
-- 6. Realtime — team_memberships streams so the athlete pending banner
--    can flip to 'active' the instant the coach approves.
-- ==========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'team_memberships'
  ) then
    alter publication supabase_realtime add table team_memberships;
  end if;
end$$;

-- ==========================================================================
-- 7. Backfill — seed memberships from existing user_preferences
-- ==========================================================================
-- For each user who already has a team_id on user_preferences, create an
-- active membership. Map the legacy 'admin' role to coach (team-level top
-- role); cross-team admin powers come from is_platform_admin below.
insert into team_memberships (
  clerk_user_id, team_id, player_id, role, status,
  default_team, requested_name, requested_email,
  requested_at, decided_at, decided_by, deny_reason
)
select
  up.clerk_user_id,
  up.team_id,
  up.impersonate_player_id,
  case when up.role = 'admin' then 'coach' else coalesce(up.role, 'athlete') end as role,
  'active',
  true,
  null, null,
  coalesce(up.created_at, now()),
  coalesce(up.created_at, now()),
  null,
  null
from user_preferences up
where up.team_id is not null
on conflict (clerk_user_id, team_id) do nothing;

-- Promote existing platform admins (legacy role='admin') to is_platform_admin.
update user_preferences
set is_platform_admin = true
where role = 'admin' and is_platform_admin = false;

-- Seed team_code for every existing team that doesn't have one. The
-- swim team gets the literal 'uchicago-swim' so it's a stable, known
-- code; any other existing teams get a safe random fallback.
update teams
set team_code = 'uchicago-swim'
where code = 'uchicago-swim' and team_code is null;

-- For any other teams missing a code, leave it null for now; the web
-- app's team-creation flow will assign one on first use, and an admin
-- can run a follow-up update if needed. (Most projects only have the
-- one swim team today; this branch is defensive.)
