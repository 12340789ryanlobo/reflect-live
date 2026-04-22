-- Phase 2.5 — allow a coach to "view as" an athlete by impersonating a player
alter table user_preferences add column if not exists impersonate_player_id bigint references players(id);
alter table user_preferences add column if not exists role text default 'coach';
alter table user_preferences drop constraint if exists user_preferences_role_check;
alter table user_preferences add constraint user_preferences_role_check
  check (role in ('admin','coach','captain','athlete'));
