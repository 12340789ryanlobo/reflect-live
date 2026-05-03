-- Phase X — survey-derived injuries.
--
-- Add source_sid so injury_reports rows derived from a paired
-- "Pain=yes + body-area text" SMS exchange can be upserted
-- idempotently. NULL = manually logged via the Report Injury dialog;
-- non-null = the inbound SID of the athlete's body-area reply that
-- produced this row. Backfill scripts and the live worker both use
-- ON CONFLICT (source_sid) to avoid creating duplicates when the same
-- session is re-processed.

ALTER TABLE injury_reports
  ADD COLUMN IF NOT EXISTS source_sid TEXT;

-- A UNIQUE CONSTRAINT (not a partial unique index) is what Postgres
-- requires for INSERT ... ON CONFLICT (source_sid) DO UPDATE to work.
-- A regular UNIQUE constraint already allows multiple NULL values
-- (Postgres treats each NULL as distinct), so manual entries with
-- source_sid=NULL still coexist fine. Earlier draft used a
-- partial unique index `WHERE source_sid IS NOT NULL` which broke
-- supabase-js's upsert helper.
DROP INDEX IF EXISTS idx_injury_reports_source_sid_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'injury_reports_source_sid_key'
      AND conrelid = 'injury_reports'::regclass
  ) THEN
    ALTER TABLE injury_reports
      ADD CONSTRAINT injury_reports_source_sid_key UNIQUE (source_sid);
  END IF;
END $$;
