-- Phase 2 — body heatmap gender support.
--
-- teams.default_gender: which silhouette the team-wide heatmap renders by
--   default ('male' | 'female'). Coach/admin toggle in Settings.
-- players.gender: per-player. Used on the player profile mini-heatmap so
--   athletes see their own body shape. Nullable — existing roster keeps
--   their team default until they update or onboarding collects it.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS default_gender text
    NOT NULL DEFAULT 'male'
    CHECK (default_gender IN ('male', 'female'));

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS gender text
    CHECK (gender IS NULL OR gender IN ('male', 'female'));
