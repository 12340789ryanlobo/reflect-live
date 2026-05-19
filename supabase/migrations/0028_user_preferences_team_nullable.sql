-- 0028: relax the NOT NULL constraint on user_preferences.team_id.
--
-- Background: the column was declared NOT NULL back in 0001 when
-- there was exactly one team and every signed-in user belonged to
-- it. Since the multi-team work (0015+), team_id has become the
-- "currently active team" pointer rather than an identity field —
-- it CAN reasonably be null (between team switches, after a team
-- is deleted, before onboarding completes).
--
-- The dashboard-shell already handles null team_id by re-resolving
-- the active team from `team_memberships` on render. This migration
-- just aligns the constraint with that behavior so:
--   - DELETE /api/teams/:id can sever user_preferences rows for
--     users on the deleted team without violating NOT NULL.
--   - Onboarding can create a prefs row before a team is picked.
--   - A user who leaves their only team isn't stuck with a stale
--     team_id pointing at a team they're no longer on.
--
-- impersonate_player_id is already nullable.

alter table user_preferences
  alter column team_id drop not null;

comment on column user_preferences.team_id is
  'Currently active team for this user. NULL between team switches, after team deletion, or before onboarding. Authoritative answer comes from team_memberships; this column is the convenience pointer.';
