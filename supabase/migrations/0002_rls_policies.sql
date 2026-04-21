-- Phase 2.2 — Row Level Security
-- Enable RLS on all end-user tables. worker_state stays RLS-off (service role only).

alter table teams enable row level security;
alter table players enable row level security;
alter table twilio_messages enable row level security;
alter table activity_logs enable row level security;
alter table user_preferences enable row level security;
alter table locations enable row level security;
alter table weather_snapshots enable row level security;

-- user_preferences: self-only
create policy "prefs self select" on user_preferences
  for select using (clerk_user_id = auth.jwt()->>'sub');
create policy "prefs self upsert" on user_preferences
  for insert with check (clerk_user_id = auth.jwt()->>'sub');
create policy "prefs self update" on user_preferences
  for update using (clerk_user_id = auth.jwt()->>'sub');

-- teams: a user can see any team they have a prefs row for
create policy "teams via prefs" on teams
  for select using (
    id in (select team_id from user_preferences where clerk_user_id = auth.jwt()->>'sub')
  );

-- players: same scoping
create policy "players via prefs" on players
  for select using (
    team_id in (select team_id from user_preferences where clerk_user_id = auth.jwt()->>'sub')
  );

-- twilio_messages: team-scoped
create policy "messages via prefs" on twilio_messages
  for select using (
    team_id in (select team_id from user_preferences where clerk_user_id = auth.jwt()->>'sub')
  );

-- activity_logs: team-scoped
create policy "activity via prefs" on activity_logs
  for select using (
    team_id in (select team_id from user_preferences where clerk_user_id = auth.jwt()->>'sub')
  );

-- locations: team-scoped
create policy "locations via prefs" on locations
  for select using (
    team_id in (select team_id from user_preferences where clerk_user_id = auth.jwt()->>'sub')
  );

-- weather_snapshots: team-scoped
create policy "weather via prefs" on weather_snapshots
  for select using (
    team_id in (select team_id from user_preferences where clerk_user_id = auth.jwt()->>'sub')
  );
