-- Phase 1c — add requested_phone to team_memberships.
--
-- Athletes provide a phone with their join request so that on approval
-- the coach can create a players row (players.phone_e164 is NOT NULL).
-- Existing rows (backfilled from user_preferences in 0015) keep null
-- since their player_id was already wired up in the migration.

alter table team_memberships add column if not exists requested_phone text;
