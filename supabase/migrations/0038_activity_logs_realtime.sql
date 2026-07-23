-- 0038_activity_logs_realtime.sql
--
-- Add activity_logs to the Realtime publication so the native app's team
-- Pulse feed ("Maya logged rehab · 20m ago") updates live on teammate
-- inserts. Reads are already team-scoped by the existing RLS SELECT
-- policies, and Realtime respects RLS, so no policy changes are needed.
--
-- MUST BE APPLIED IN THE SUPABASE SQL EDITOR.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'activity_logs'
  ) then
    alter publication supabase_realtime add table activity_logs;
  end if;
end$$;
