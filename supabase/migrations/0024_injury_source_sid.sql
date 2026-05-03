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

CREATE UNIQUE INDEX IF NOT EXISTS idx_injury_reports_source_sid_unique
  ON injury_reports(source_sid)
  WHERE source_sid IS NOT NULL;
