-- Phase 2.6 — per-team Twilio configuration so multiple teams can coexist.
-- Teams share one Supabase + worker + Railway service, but each team has its own
-- Twilio credentials (different SMS number, different account). The worker reads
-- each team's creds at poll time.

alter table teams add column if not exists twilio_account_sid text;
alter table teams add column if not exists twilio_auth_token  text;
alter table teams add column if not exists twilio_phone_number text;
alter table teams add column if not exists description text;

-- Keep these off the RLS SELECT path — they're secrets. worker_state-style
-- handling: only the service-role client ever reads them. Revoke anon SELECT
-- on the auth-token column via a column-level policy. Rather than exposing
-- the raw token to the browser (even with RLS), route client reads through a
-- team_public view that omits creds.

create or replace view public.teams_public as
  select id, name, code, description, twilio_phone_number, created_at
  from teams;

grant select on public.teams_public to anon, authenticated;

-- Note: the underlying `teams` table still has SELECT via existing RLS, but
-- the sensitive columns (twilio_account_sid, twilio_auth_token) should only
-- be read via the service role. Clients should query `teams_public` instead.
