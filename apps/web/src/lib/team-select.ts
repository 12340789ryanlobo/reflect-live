/**
 * Columns of the `teams` table that are safe to expose to the browser.
 *
 * Excludes the SMS-credential secrets — twilio_account_sid, twilio_auth_token
 * — and admin_api_key, which are read only server-side via the service role
 * (lib/twilio-sms.ts, api/twilio-media, admin-only /api/teams). Browser
 * clients — and any service-role read whose result is returned to the browser,
 * e.g. the team bundled into the /api/preferences response — must select this
 * list, never '*'.
 *
 * Kept in sync with the column-level GRANT in
 * supabase/migrations/0035_secure_team_credentials.sql: the `authenticated`
 * role may SELECT only these columns, so a stray select('*') now fails loudly
 * instead of silently leaking credentials.
 */
export const TEAM_SELECT =
  'id, name, code, created_at, description, twilio_phone_number, scoring_json, default_gender, team_code, creation_status, activity_visibility, captain_can_view_sessions, competition_start_date, plan';
