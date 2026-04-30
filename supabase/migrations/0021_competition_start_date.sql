-- 0021: per-team competition / season start date
--
-- Coach picks a date; team leaderboards (and the per-athlete rank in
-- the C1 hero) compute over activity_logs.logged_at >= this date.
-- Null = no active competition; rank falls back to all-time.

alter table public.teams
  add column if not exists competition_start_date date;
