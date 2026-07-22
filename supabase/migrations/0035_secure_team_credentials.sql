-- 0035_secure_team_credentials.sql
-- Security hardening for the `teams` table and the `teams_public` view.
--
-- Problem 1 — SMS credentials leaked to the browser. The `authenticated`
-- role had table-wide SELECT on `teams`, so any select('*') from a browser
-- client (dashboard-shell, settings page) returned twilio_account_sid /
-- twilio_auth_token / admin_api_key to every team member, athletes included.
-- Migration 0006 documented an intent to lock these down but never did.
--
-- Fix: drop the blanket SELECT and re-grant SELECT only on the non-secret
-- columns the web app reads. This list is kept in sync with TEAM_SELECT in
-- apps/web/src/lib/team-select.ts — a browser query may select only these.
-- Row visibility is unchanged (still governed by the existing RLS policies);
-- this narrows *columns*, not rows. The service_role client used by every API
-- route bypasses column privileges, so routes that legitimately read the
-- credentials (lib/twilio-sms.ts, api/twilio-media, admin-only /api/teams)
-- keep working.

revoke select on public.teams from anon, authenticated;

grant select (
  id,
  name,
  code,
  created_at,
  description,
  twilio_phone_number,
  scoring_json,
  default_gender,
  team_code,
  creation_status,
  activity_visibility,
  captain_can_view_sessions,
  competition_start_date,
  plan
) on public.teams to anon, authenticated;

-- Problem 2 — teams_public bypassed RLS. It was created without
-- security_invoker (so it ran with the view owner's rights) and granted to
-- anon, letting anyone holding the public anon key enumerate every team's
-- name, join code, and Twilio number. Its only app reader (/api/teams-public)
-- uses the service role, so these grants bought nothing.
--
-- Fix: make the view respect the caller's RLS and drop the public grants.
alter view public.teams_public set (security_invoker = on);
revoke select on public.teams_public from anon, authenticated;
