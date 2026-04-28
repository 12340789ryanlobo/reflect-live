-- Phase 2 — body heatmap.
--
-- injury_reports: one row per athlete-reported (or coach-logged) injury.
-- regions: array of canonical body region keys (e.g. ['knee','ankle']).
--   Free-text 'description' is parsed into regions via the alias map in
--   apps/web/src/lib/injury-aliases.ts.
-- severity: 1-5 self-reported (5 = sidelined). NULL allowed for v0.
-- resolved_at: NULL while still active. Coaches mark resolved when the
--   athlete is back to full training.

CREATE TABLE IF NOT EXISTS injury_reports (
  id            bigint generated always as identity primary key,
  team_id       bigint not null references teams(id),
  player_id     bigint not null references players(id),
  regions       text[] not null,
  severity      smallint check (severity is null or (severity between 1 and 5)),
  description   text not null,
  reported_at   timestamptz not null default now(),
  resolved_at   timestamptz,
  reported_by   text  -- Clerk user_id of who logged it (athlete self vs coach)
);

CREATE INDEX IF NOT EXISTS idx_injury_team_active
  ON injury_reports(team_id, reported_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_injury_team_recent
  ON injury_reports(team_id, reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_injury_player
  ON injury_reports(player_id, reported_at DESC);

-- RLS — same scoping pattern as other end-user tables: visible to users whose
-- user_preferences.team_id matches the row's team_id.
ALTER TABLE injury_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY injury_reports_team_read
  ON injury_reports FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM user_preferences
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

-- Writes are routed through the service-role API endpoint, not RLS.
