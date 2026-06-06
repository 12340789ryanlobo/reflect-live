export type Category = 'workout' | 'rehab' | 'survey' | 'chat';
export type ActivityKind = 'workout' | 'rehab';
export type Gender = 'male' | 'female';

export interface TeamScoring {
  workout_score: number;
  rehab_score: number;
}

/**
 * Per-team configurable competition (migration 0029). Replaces the
 * legacy single-competition slot on `teams.scoring_json` + `teams.competition_start_date`.
 * Multiple competitions allowed per team (overlapping OK).
 */
export interface Competition {
  id: number;
  team_id: number;
  name: string;
  /** ISO date string (YYYY-MM-DD). */
  starts_at: string;
  /** ISO date string (YYYY-MM-DD). On-or-after starts_at (DB constraint). */
  ends_at: string;
  /** kind→points map. e.g. { swim: 2, workout: 1, rehab: 0.6 }. Empty {} valid. */
  scoring: Record<string, number>;
  /** Stacking adjustments applied once per (player, day) where the kind count
   *  meets `min_per_day`. `bonus_points` is signed: positive rewards
   *  stacking, negative discourages it. Coaches stack multiple rules for
   *  tiered effects. */
  bonus_rules: CompetitionBonusRule[];
  created_by: string;
  created_at: string;
  archived_at: string | null;
}

export interface CompetitionBonusRule {
  kind: string;
  min_per_day: number;
  bonus_points: number;
}

export interface Team {
  id: number;
  name: string;
  code: string;
  created_at: string;
  description?: string | null;
  twilio_account_sid?: string | null;
  twilio_auth_token?: string | null;
  twilio_phone_number?: string | null;
  scoring_json: TeamScoring;
  default_gender: Gender;
  // Phase 1a additions:
  team_code: string | null;       // shareable join code
  creation_status: TeamCreationStatus;
  activity_visibility: ActivityVisibility;
  // Captain permissions (migration 0019):
  captain_can_view_sessions: boolean;
  // Competition / season window (migration 0021). Null = no active
  // competition; rank computations fall back to all-time.
  competition_start_date: string | null;
}

export interface Player {
  id: number;
  team_id: number;
  name: string;
  phone_e164: string;
  group: string | null;
  active: boolean;
  created_at: string;
  gender: Gender | null;
}

export interface TwilioMessage {
  sid: string;
  direction: string;
  from_number: string | null;
  to_number: string | null;
  body: string | null;
  status: string | null;
  category: Category;
  date_sent: string;
  player_id: number | null;
  team_id: number | null;
  ingested_at: string;
  /** Twilio Media SIDs for any photos/videos attached to this message
   *  (migration 0023). Render via /api/twilio-media/<sid>/<mediaSid>. */
  media_sids: string[] | null;
  /** Soft-delete flag — true when a coach or athlete has deleted this
   *  row. Read queries filter on hidden=false; write paths set this. */
  hidden?: boolean;
  /** Groups all messages sent in one self-report delivery batch so they
   *  can be deleted together. Matches self_report_sessions.id. */
  session_id?: string | null;
}

export interface ActivityLog {
  id: number;
  player_id: number;
  team_id: number;
  kind: ActivityKind;
  description: string;
  image_path: string | null;
  /** Mirrored from twilio_messages.media_sids when this log was
   *  ingested from a workout/rehab SMS (migration 0023). */
  media_sids: string[] | null;
  logged_at: string;
  created_at: string;
  source_sid: string | null;
  hidden: boolean;
}

export interface WorkerState {
  id: number;
  last_date_sent: string | null;
  last_twilio_poll_at: string | null;
  last_weather_poll_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
  backfill_complete: boolean;
}

export type UserRole = 'admin' | 'coach' | 'captain' | 'athlete';

export interface UserPreferences {
  clerk_user_id: string;
  team_id: number;
  watchlist: number[];
  group_filter: string | null;
  role: UserRole | null;
  impersonate_player_id: number | null;
  created_at: string;
  updated_at: string;
  // Phase 1a addition:
  is_platform_admin: boolean;
}

export interface Location {
  id: number;
  team_id: number;
  name: string;
  kind: 'training' | 'meet';
  /** Nullable since migration 0030 — events can exist without weather. */
  lat: number | null;
  lon: number | null;
  /** Resolved place label (migration 0031), e.g. "Chicago, Illinois, US".
   *  NULL when no weather location is set. */
  place_label: string | null;
  /** Coach-flagged key event (migration 0032) — pinned to the top of
   *  the Events timeline. */
  is_pinned: boolean;
  event_date: string | null;
  created_at: string;
}

export interface WeatherSnapshot {
  id: number;
  location_id: number;
  team_id: number;
  temp_c: number | null;
  precip_mm: number | null;
  wind_kph: number | null;
  humidity_pct: number | null;
  condition_code: number | null;
  fetched_at: string;
}

export interface NewsItem {
  id: number;
  source: string;
  title: string;
  url: string;
  summary: string | null;
  image_url: string | null;
  published_at: string | null;
  ingested_at: string;
}

// ---- Membership foundation (sub-1, see 2026-04-29 spec) -------------------

export type MembershipRole = 'athlete' | 'captain' | 'coach';

export type MembershipStatus =
  | 'requested'  // athlete asked to join, awaiting decision
  | 'invited'    // (sub-4) coach pre-invited, awaiting claim
  | 'active'     // confirmed both ways, full member
  | 'denied'     // coach declined the request (audit row)
  | 'left'       // athlete voluntarily left or withdrew request
  | 'removed';   // coach removed athlete from team

export type TeamCreationStatus = 'pending' | 'active' | 'suspended';

export type ActivityVisibility = 'public' | 'coaches_only';

export interface TeamMembership {
  clerk_user_id: string;
  team_id: number;
  player_id: number | null;
  role: MembershipRole;
  status: MembershipStatus;
  default_team: boolean;
  requested_name: string | null;
  requested_email: string | null;
  requested_phone: string | null;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  deny_reason: string | null;
}

export interface PlatformSettings {
  id: 1;
  require_team_approval: boolean;
}
