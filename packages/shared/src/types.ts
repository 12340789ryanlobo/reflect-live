export type Category = 'workout' | 'rehab' | 'survey' | 'chat';
export type ActivityKind = 'workout' | 'rehab';

export interface Team {
  id: number;
  name: string;
  code: string;
  created_at: string;
  description?: string | null;
  twilio_account_sid?: string | null;
  twilio_auth_token?: string | null;
  twilio_phone_number?: string | null;
}

export interface Player {
  id: number;
  team_id: number;
  name: string;
  phone_e164: string;
  group: string | null;
  active: boolean;
  created_at: string;
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
}

export interface ActivityLog {
  id: number;
  player_id: number;
  team_id: number;
  kind: ActivityKind;
  description: string;
  image_path: string | null;
  logged_at: string;
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
}

export interface Location {
  id: number;
  team_id: number;
  name: string;
  kind: 'training' | 'meet';
  lat: number;
  lon: number;
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
