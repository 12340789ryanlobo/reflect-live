-- Replace the partial unique index on activity_logs.source_sid with a
-- regular UNIQUE constraint. supabase-js's upsert(onConflict: 'source_sid')
-- generates `ON CONFLICT (source_sid)` without an index_predicate, which
-- Postgres won't match against a partial index. A regular UNIQUE constraint
-- on a nullable column still allows multiple NULLs (each NULL is distinct).

DROP INDEX IF EXISTS idx_activity_logs_source_sid;

ALTER TABLE activity_logs
  ADD CONSTRAINT uq_activity_logs_source_sid UNIQUE (source_sid);
