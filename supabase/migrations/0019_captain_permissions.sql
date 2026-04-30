-- 0019: per-team toggle controlling whether captains see Sessions + Templates
-- in the sidebar. Off by default — coaches opt in.

alter table public.teams
  add column if not exists captain_can_view_sessions boolean not null default false;
