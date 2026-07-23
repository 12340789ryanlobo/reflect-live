-- 0037_client_write_policies.sql
--
-- Client-write security model for Reflect v2.
--
-- Adds write policies for the tables athletes and coaches interact with
-- directly from the native app, and two security-definer RPCs that handle
-- actions requiring elevated or multi-step writes (team join, team creation).
--
-- MUST BE APPLIED IN THE SUPABASE SQL EDITOR after 0036.
--
-- Role + status values (from 0015 schema):
--   role:   athlete | captain | coach
--   status: requested | invited | active | denied | left | removed

-- ==========================================================================
-- 1. players — coach-only writes; no delete (deactivate via active=false)
-- ==========================================================================

drop policy if exists players_coach_insert on players;
create policy players_coach_insert on players
  for insert
  with check (private.my_role(team_id) in ('coach', 'captain'));

drop policy if exists players_coach_update on players;
create policy players_coach_update on players
  for update
  using (private.my_role(team_id) in ('coach', 'captain'));

-- ==========================================================================
-- 2. team_memberships — self-request insert; constrained self-updates;
--    coach decides on status/role/player_id
-- ==========================================================================

-- Athletes may submit a join request for themselves only.
-- Constrained: status must be 'requested', role must be 'athlete',
-- player_id must be null (coach links the player row on approval).
drop policy if exists memberships_self_request_insert on team_memberships;
create policy memberships_self_request_insert on team_memberships
  for insert
  with check (
    user_id = private.uid()
    and status = 'requested'
    and role = 'athlete'
    and player_id is null
  );

-- Athletes may update their own row only to withdraw (left) or re-submit
-- (requested). Coaches update via the definer RPC or direct service-role calls.
drop policy if exists memberships_self_update on team_memberships;
create policy memberships_self_update on team_memberships
  for update
  using  (user_id = private.uid())
  with check (status in ('requested', 'left'));

-- Coaches and captains may update any membership row on their team
-- (to approve, deny, set role, link player_id, etc.).
drop policy if exists memberships_coach_update on team_memberships;
create policy memberships_coach_update on team_memberships
  for update
  using (private.my_role(team_id) in ('coach', 'captain'));

-- ==========================================================================
-- 3. activity_logs — athlete insert (own player_id, own team, source_sid
--    null, hidden false); coach insert (any player on their team);
--    column-restricted updates; no delete
-- ==========================================================================

-- Athlete insert: must log to their own linked player_id, on a team they
-- are active on, with source_sid null and hidden false (SMS shadow rows
-- have source_sid set; that path is worker-only).
drop policy if exists activity_logs_athlete_insert on activity_logs;
create policy activity_logs_athlete_insert on activity_logs
  for insert
  with check (
    player_id = private.my_player_id(team_id)
    and private.my_role(team_id) = 'athlete'
    and source_sid is null
    and hidden = false
  );

-- Coach insert: any player on any of the coach's active teams.
drop policy if exists activity_logs_coach_insert on activity_logs;
create policy activity_logs_coach_insert on activity_logs
  for insert
  with check (private.my_role(team_id) in ('coach', 'captain'));

-- Updates: revoke broad update, then grant only the editable columns.
-- No DELETE policy — hidden=true is the only removal path.
revoke update on public.activity_logs from authenticated;

grant update (kind, description, logged_at, hidden, image_path)
  on public.activity_logs to authenticated;

-- Athlete may update their own rows (column-grant above already restricts
-- which columns can change).
drop policy if exists activity_logs_athlete_update on activity_logs;
create policy activity_logs_athlete_update on activity_logs
  for update
  using (player_id = private.my_player_id(team_id));

-- Coach may update any row on their team.
drop policy if exists activity_logs_coach_update on activity_logs;
create policy activity_logs_coach_update on activity_logs
  for update
  using (private.my_role(team_id) in ('coach', 'captain'));

-- ==========================================================================
-- 4. RPC: join_team_by_code
--
-- Looks up a team by team_code, then upserts a team_memberships row for
-- the calling user.
--
--   via_invite_link = true  → status becomes 'active'; an auto-created or
--     matched players row is linked immediately (invite-link joins skip the
--     approval queue).
--   via_invite_link = false → status becomes 'requested'; no players row is
--     auto-created (coach links on approval). requested_name / requested_email
--     / requested_phone are stored for the coach's review.
--
-- Idempotent: if a membership already exists (any status) the row is updated
-- in-place rather than duplicated; the team_id is returned either way.
-- Returns the team's bigint id.
-- ==========================================================================

create or replace function public.join_team_by_code(
  p_code        text,
  p_name        text,
  p_email       text,
  p_phone       text,
  p_via_invite_link boolean default false
)
  returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_team_id  bigint;
  v_user_id  text;
  v_player_id bigint;
  v_existing_status text;
begin
  v_user_id := (auth.uid())::text;

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Resolve the team. team_code column was added in 0015; the unique index
  -- on it means this will find at most one row.
  select id into v_team_id
  from teams
  where team_code = p_code;

  if v_team_id is null then
    raise exception 'Team not found for code %', p_code;
  end if;

  -- Check for an existing membership row.
  select status into v_existing_status
  from team_memberships
  where user_id = v_user_id and team_id = v_team_id;

  if p_via_invite_link then
    -- Invite-link path: auto-create a players row if the caller doesn't
    -- already have one linked on this team.
    select player_id into v_player_id
    from team_memberships
    where user_id = v_user_id and team_id = v_team_id;

    if v_player_id is null then
      insert into players (team_id, name, phone_e164, active)
      values (v_team_id, p_name, coalesce(p_phone, ''), true)
      returning id into v_player_id;
    end if;

    -- Upsert an active membership.
    insert into team_memberships (
      user_id, team_id, player_id, role, status, default_team,
      requested_name, requested_email, requested_phone,
      requested_at, decided_at
    )
    values (
      v_user_id, v_team_id, v_player_id, 'athlete', 'active', true,
      p_name, p_email, p_phone,
      now(), now()
    )
    on conflict (user_id, team_id) do update
      set status      = 'active',
          player_id   = coalesce(team_memberships.player_id, excluded.player_id),
          decided_at  = now();

  else
    -- Cold-code path: request only, no players row yet.
    insert into team_memberships (
      user_id, team_id, player_id, role, status, default_team,
      requested_name, requested_email, requested_phone,
      requested_at
    )
    values (
      v_user_id, v_team_id, null, 'athlete', 'requested', true,
      p_name, p_email, p_phone,
      now()
    )
    on conflict (user_id, team_id) do update
      set requested_name  = excluded.requested_name,
          requested_email = excluded.requested_email,
          requested_phone = excluded.requested_phone,
          requested_at    = now()
      where team_memberships.status = 'requested';
    -- If status is not 'requested' (e.g. already active/denied), leave it
    -- alone — returning the team_id is still correct for the caller.
  end if;

  return v_team_id;
end;
$$;

revoke execute on function public.join_team_by_code(text, text, text, text, boolean) from anon, public;
grant  execute on function public.join_team_by_code(text, text, text, text, boolean) to authenticated;

-- ==========================================================================
-- 5. RPC: create_team_with_manager
--
-- Creates a new teams row with a generated 6-char uppercase alphanumeric
-- team_code (retries on collision), then inserts an active coach-role
-- membership for auth.uid() with default_team = true.
-- Returns the new team's bigint id.
--
-- teams NOT NULL columns: id (generated), name, code, timezone (default),
--   scoring_json (default), creation_status (default), plan (default).
-- 'code' (from 0001) is the legacy slug field — we set it equal to
-- team_code so it satisfies the NOT NULL + unique constraint without
-- requiring separate input.
-- ==========================================================================

create or replace function public.create_team_with_manager(
  p_name     text,
  p_timezone text default 'America/Chicago'
)
  returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_user_id  text;
  v_team_id  bigint;
  v_code     text;
  v_attempts int := 0;
begin
  v_user_id := (auth.uid())::text;

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Generate a unique 6-char uppercase alphanumeric team_code.
  loop
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) for 6));
    -- Retry if the code is already taken (extremely rare but correct).
    exit when not exists (select 1 from teams where team_code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'Could not generate a unique team code after 20 attempts';
    end if;
  end loop;

  insert into teams (name, code, team_code, timezone)
  values (p_name, v_code, v_code, p_timezone)
  returning id into v_team_id;

  insert into team_memberships (
    user_id, team_id, player_id, role, status,
    default_team, decided_at
  )
  values (
    v_user_id, v_team_id, null, 'coach', 'active',
    true, now()
  );

  return v_team_id;
end;
$$;

revoke execute on function public.create_team_with_manager(text, text) from anon, public;
grant  execute on function public.create_team_with_manager(text, text) to authenticated;
