-- supabase/migrations/0009_team_scoring_config.sql
--
-- Phase 1 — fitness scoring + leaderboard.
-- Adds per-team configurable point values for workouts and rehabs.
-- Defaults match the historical reflect implementation: workout=1.0, rehab=0.5.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS scoring_json jsonb
    NOT NULL
    DEFAULT '{"workout_score": 1.0, "rehab_score": 0.5}'::jsonb;

COMMENT ON COLUMN teams.scoring_json IS
  'Phase 1: per-team scoring config. Shape: {"workout_score": number, "rehab_score": number}.';
