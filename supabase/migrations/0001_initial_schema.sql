-- Phase 2.1 — core schema
create extension if not exists pgcrypto;

-- teams
create table if not exists teams (
  id bigint generated always as identity primary key,
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- players
create table if not exists players (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id),
  name text not null,
  phone_e164 text not null,
  "group" text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (team_id, phone_e164)
);
create index if not exists idx_players_team on players(team_id);
create index if not exists idx_players_phone on players(phone_e164);

-- twilio_messages
create table if not exists twilio_messages (
  sid text primary key,
  direction text not null,
  from_number text,
  to_number text,
  body text,
  status text,
  category text not null default 'chat' check (category in ('workout','rehab','survey','chat')),
  date_sent timestamptz not null,
  player_id bigint references players(id),
  team_id bigint references teams(id),
  ingested_at timestamptz not null default now()
);
create index if not exists idx_twm_team_date on twilio_messages(team_id, date_sent desc);
create index if not exists idx_twm_player_date on twilio_messages(player_id, date_sent desc);
create index if not exists idx_twm_team_cat_date on twilio_messages(team_id, category, date_sent desc);

-- activity_logs
create table if not exists activity_logs (
  id bigint generated always as identity primary key,
  player_id bigint not null references players(id),
  team_id bigint not null references teams(id),
  kind text not null check (kind in ('workout','rehab')),
  description text not null,
  image_path text,
  logged_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_activity_logs_dedupe on activity_logs(player_id, kind, logged_at, md5(description));
create index if not exists idx_al_player_logged on activity_logs(player_id, logged_at desc);
create index if not exists idx_al_team_kind on activity_logs(team_id, kind, logged_at desc);

-- locations (hand-seeded: training pool + meet venues)
create table if not exists locations (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id),
  name text not null,
  kind text not null check (kind in ('training','meet')),
  lat double precision not null,
  lon double precision not null,
  event_date date,
  created_at timestamptz not null default now()
);
create index if not exists idx_locations_team on locations(team_id);

-- weather_snapshots
create table if not exists weather_snapshots (
  id bigint generated always as identity primary key,
  location_id bigint not null references locations(id),
  team_id bigint not null references teams(id),
  temp_c real,
  precip_mm real,
  wind_kph real,
  humidity_pct real,
  condition_code int,
  fetched_at timestamptz not null default now()
);
create index if not exists idx_ws_loc_time on weather_snapshots(location_id, fetched_at desc);
create index if not exists idx_ws_team_time on weather_snapshots(team_id, fetched_at desc);

-- worker_state (single row)
create table if not exists worker_state (
  id int primary key default 1 check (id = 1),
  last_date_sent timestamptz,
  last_twilio_poll_at timestamptz,
  last_weather_poll_at timestamptz,
  last_error text,
  consecutive_errors int not null default 0,
  backfill_complete boolean not null default false
);
insert into worker_state (id) values (1) on conflict (id) do nothing;

-- user_preferences
create table if not exists user_preferences (
  clerk_user_id text primary key,
  team_id bigint not null references teams(id),
  watchlist bigint[] not null default '{}',
  group_filter text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_prefs_team on user_preferences(team_id);
