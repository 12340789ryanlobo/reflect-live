-- 0036_supabase_auth_identity.sql
--
-- Identity cutover: replace Clerk user ids with Supabase Auth uids.
--
-- PURPOSE
--   Rename clerk_user_id → user_id on user_preferences and team_memberships
--   so every RLS expression can key off (auth.uid())::text instead of
--   auth.jwt()->>'sub'. Type stays text (no FK to auth.users) so the column
--   swap is purely mechanical.
--
-- MUST BE APPLIED IN THE SUPABASE SQL EDITOR (not via CLI migration).
--
-- MANUAL STEP — run once after Ryan's first Apple/OTP sign-in:
--   After signing in with Apple (or OTP), find your new auth uid in
--   Supabase Dashboard → Authentication → Users. Then run:
--
--   UPDATE user_preferences
--     SET user_id = '<new-supabase-auth-uid>'
--     WHERE user_id = '<old-clerk-user_2…-id>';
--
--   UPDATE team_memberships
--     SET user_id = '<new-supabase-auth-uid>'
--     WHERE user_id = '<old-clerk-user_2…-id>';
--
--   Verify: SELECT * FROM team_memberships WHERE user_id = '<new-supabase-auth-uid>';
--
-- COLUMN RENAME SAFETY
--   Postgres RLS policy expressions are stored as pg_node_tree (not raw text)
--   and are recompiled on column rename — they DO NOT break. A sweep of all
--   migrations confirmed there are no function bodies, stored views with
--   clerk_user_id in their select list, or trigger definitions that store the
--   name as opaque text. The only view is teams_public (0006) which does not
--   reference clerk_user_id. phone_verifications.clerk_user_id is a separate
--   column on a separate table and is intentionally left as-is (that table is
--   being retired in Phase 4 along with Twilio).

-- ==========================================================================
-- 1. Rename clerk_user_id → user_id
-- ==========================================================================

alter table user_preferences rename column clerk_user_id to user_id;
alter table team_memberships rename column clerk_user_id to user_id;

-- ==========================================================================
-- 2. private schema + security-definer helper functions
--
-- Using a security definer function for team_memberships lookups eliminates
-- the self-referencing recursion that forced the policy drop in 0017. All
-- RLS expressions below delegate to these helpers instead of querying
-- team_memberships directly.
-- ==========================================================================

create schema if not exists private;

-- Revoke default public execute that Postgres grants to new functions.
-- We re-grant selectively to authenticated below.

-- private.uid() — returns the calling user's auth uid cast to text.
-- Centralises the (auth.uid())::text cast so callers stay readable.
create or replace function private.uid()
  returns text
  language sql stable security definer
  set search_path = public
as $$
  select (auth.uid())::text
$$;

revoke execute on function private.uid() from anon, public;
grant  execute on function private.uid() to authenticated;

-- private.my_team_ids() — returns the set of team_ids where the caller
-- has an active membership. Used in team-scoped read policies.
create or replace function private.my_team_ids()
  returns setof bigint
  language sql stable security definer
  set search_path = public
as $$
  select team_id
  from team_memberships
  where user_id = (auth.uid())::text
    and status = 'active'
$$;

revoke execute on function private.my_team_ids() from anon, public;
grant  execute on function private.my_team_ids() to authenticated;

-- private.my_role(tid bigint) — returns the caller's role on a specific
-- team, or NULL if they have no active membership on that team.
create or replace function private.my_role(tid bigint)
  returns text
  language sql stable security definer
  set search_path = public
as $$
  select role
  from team_memberships
  where user_id = (auth.uid())::text
    and team_id = tid
    and status = 'active'
  limit 1
$$;

revoke execute on function private.my_role(bigint) from anon, public;
grant  execute on function private.my_role(bigint) to authenticated;

-- private.my_player_id(tid bigint) — returns the caller's linked player_id
-- on a specific team, or NULL if none is linked.
create or replace function private.my_player_id(tid bigint)
  returns bigint
  language sql stable security definer
  set search_path = public
as $$
  select player_id
  from team_memberships
  where user_id = (auth.uid())::text
    and team_id = tid
    and status = 'active'
  limit 1
$$;

revoke execute on function private.my_player_id(bigint) from anon, public;
grant  execute on function private.my_player_id(bigint) to authenticated;

-- ==========================================================================
-- 3. Restore the coach/captain roster read policy (dropped in 0017).
--
-- 0017 dropped memberships_team_managers_read because its WHERE clause
-- queried team_memberships recursively, hitting Postgres's RLS recursion
-- guard. The private.my_role() definer function above breaks the recursion
-- (it runs with elevated rights, bypassing RLS on the inner lookup).
-- ==========================================================================

drop policy if exists memberships_team_managers_read on team_memberships;
create policy memberships_team_managers_read on team_memberships
  for select
  using (private.my_role(team_id) in ('coach', 'captain'));
