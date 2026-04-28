-- Phase 1.5 — make activity_logs self-syncing.
--
-- source_sid: when a row originates from a twilio_messages record, store
-- its sid here. Worker dual-writes use it for idempotency; backfill uses
-- it to skip rows already imported.
--
-- hidden: soft-delete flag. Coaches can hide mistake uploads without losing
-- the record, and re-running the seed won't resurrect hidden rows.

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS source_sid text,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

-- Unique on source_sid (nullable; multiple NULLs allowed) so the same SMS
-- can't be inserted twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_logs_source_sid
  ON activity_logs(source_sid)
  WHERE source_sid IS NOT NULL;

-- Filter index for visible rows (queries always filter hidden = false).
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_visible
  ON activity_logs(team_id, logged_at DESC)
  WHERE hidden = false;
