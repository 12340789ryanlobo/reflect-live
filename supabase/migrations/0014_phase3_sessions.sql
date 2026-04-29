-- Phase 3 — sessions, templates, scheduler (shadow mode).
--
-- Mirrors reflect's SQLite session-engine schema in Postgres.
--
-- New tables:
--   sessions             — one per practice/match/lifting check-in cohort
--   deliveries           — per-player survey state machine (UNIQUE per session+player)
--   responses            — atomic answers (one row per question answer)
--   flags                — derived alerts (low readiness, injury concern, ...)
--   scheduled_sends      — future survey blasts (one-off + cadence)
--   question_templates   — reusable per-team question sets
--   dry_run_log          — shadow-mode would-have-sent ledger
--
-- Extensions:
--   teams   adds: timezone, principles_json, groups_json, chart_preferences_json, admin_api_key
--   players adds: group_tags (text[]), is_captain (boolean)
--
-- Existing extensions already shipped in earlier migrations (kept here as
-- a NOTE so reviewers don't redo them):
--   teams.scoring_config   → 0009
--   teams.default_gender   → 0013
--   players.gender         → 0013
--
-- Outbound SMS sends from the worker stay gated behind the
-- TWILIO_OUTBOUND_ENABLED env var (default false). Until it flips, every
-- intended send writes to dry_run_log so we can diff against reflect's
-- actual sends during the shadow soak.

-- ==========================================================================
-- 1. teams + players extensions
-- ==========================================================================
alter table teams add column if not exists timezone text not null default 'America/Chicago';
alter table teams add column if not exists principles_json jsonb;
alter table teams add column if not exists groups_json jsonb;
alter table teams add column if not exists chart_preferences_json jsonb;
alter table teams add column if not exists admin_api_key text;

alter table players add column if not exists group_tags text[] not null default '{}';
alter table players add column if not exists is_captain boolean not null default false;

create index if not exists idx_players_captain on players(team_id) where is_captain = true;
create index if not exists idx_players_group_tags on players using gin(group_tags);

-- ==========================================================================
-- 2. sessions
-- ==========================================================================
create table if not exists sessions (
  id              bigint generated always as identity primary key,
  team_id         bigint not null references teams(id),
  type            text not null check (type in ('practice','match','lifting')),
  label           text not null,
  template_id     bigint, -- FK added after question_templates is defined
  video_links_json jsonb,
  metadata_json   jsonb,  -- frozen question_snapshot lives here
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_sessions_team on sessions(team_id, created_at desc);
create index if not exists idx_sessions_team_active
  on sessions(team_id, created_at desc)
  where deleted_at is null;

-- ==========================================================================
-- 3. deliveries
-- ==========================================================================
create table if not exists deliveries (
  id                bigint generated always as identity primary key,
  session_id        bigint not null references sessions(id),
  player_id         bigint not null references players(id),
  status            text not null default 'pending'
    check (status in ('pending','in_progress','completed','abandoned')),
  started_at        timestamptz,
  completed_at      timestamptz,
  current_q_idx     int not null default 0,
  reminder_sent_at  timestamptz,
  session_type      text,
  created_at        timestamptz not null default now(),
  unique (session_id, player_id)
);
create index if not exists idx_deliveries_session on deliveries(session_id);
create index if not exists idx_deliveries_status on deliveries(status);
create index if not exists idx_deliveries_pending_reminder
  on deliveries(reminder_sent_at)
  where status = 'in_progress';

-- ==========================================================================
-- 4. responses
-- ==========================================================================
create table if not exists responses (
  id           bigint generated always as identity primary key,
  session_id   bigint not null references sessions(id),
  player_id    bigint not null references players(id),
  question_id  text not null,
  answer_raw   text not null,
  answer_num   double precision,
  created_at   timestamptz not null default now()
);
create index if not exists idx_responses_session on responses(session_id, player_id);
create index if not exists idx_responses_player on responses(player_id, created_at desc);

-- ==========================================================================
-- 5. flags
-- ==========================================================================
create table if not exists flags (
  id          bigint generated always as identity primary key,
  session_id  bigint not null references sessions(id),
  player_id   bigint not null references players(id),
  flag_type   text not null check (flag_type in ('low_readiness','high_pain','injury_concern','custom')),
  severity    text not null check (severity in ('low','medium','high')),
  details     text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_flags_session on flags(session_id);
create index if not exists idx_flags_player on flags(player_id, created_at desc);
create index if not exists idx_flags_severity on flags(severity);

-- ==========================================================================
-- 6. scheduled_sends
-- ==========================================================================
create table if not exists scheduled_sends (
  id               bigint generated always as identity primary key,
  session_id       bigint not null references sessions(id),
  scheduled_at     timestamptz not null,
  group_filter     text,
  player_ids_json  jsonb,
  channel          text not null default 'whatsapp' check (channel in ('whatsapp','sms')),
  status           text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  processing_at    timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    text,
  sent_at          timestamptz,
  error_message    text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_scheduled_sends_pending
  on scheduled_sends(scheduled_at)
  where status = 'pending';
create index if not exists idx_scheduled_sends_session on scheduled_sends(session_id);

-- ==========================================================================
-- 7. question_templates
-- ==========================================================================
create table if not exists question_templates (
  id            bigint generated always as identity primary key,
  team_id       bigint not null references teams(id),
  name          text not null,
  session_type  text not null default 'practice' check (session_type in ('practice','match','lifting')),
  questions_json jsonb not null,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_question_templates_team on question_templates(team_id, session_type);

-- Hook sessions.template_id back to question_templates now that it exists.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'sessions_template_id_fkey'
      and table_name = 'sessions'
  ) then
    alter table sessions
      add constraint sessions_template_id_fkey
      foreign key (template_id) references question_templates(id) on delete set null;
  end if;
end$$;

-- ==========================================================================
-- 8. dry_run_log — shadow-mode ledger of would-have-sent messages
-- ==========================================================================
create table if not exists dry_run_log (
  id                  bigint generated always as identity primary key,
  team_id             bigint not null references teams(id),
  session_id          bigint references sessions(id),
  player_id           bigint references players(id),
  scheduled_at        timestamptz not null,
  channel             text not null,
  body_preview        text not null,
  would_block_reason  text, -- null when send would have proceeded
  reflect_sid         text, -- if matched against reflect's actual send
  diff_status         text check (diff_status in ('match','only_us','only_reflect','content_diff')),
  created_at          timestamptz not null default now()
);
create index if not exists idx_dry_run_team_time on dry_run_log(team_id, scheduled_at desc);
create index if not exists idx_dry_run_diff on dry_run_log(diff_status, scheduled_at desc);

-- ==========================================================================
-- 9. RLS — read scoping mirrors injury_reports pattern; writes go through
--          service-role API endpoints, not RLS.
-- ==========================================================================
alter table sessions             enable row level security;
alter table deliveries           enable row level security;
alter table responses            enable row level security;
alter table flags                enable row level security;
alter table scheduled_sends      enable row level security;
alter table question_templates   enable row level security;
-- dry_run_log is worker-only (service role); no RLS policies.

create policy sessions_team_read on sessions
  for select using (
    team_id in (
      select team_id from user_preferences
      where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

create policy deliveries_team_read on deliveries
  for select using (
    session_id in (
      select id from sessions
      where team_id in (
        select team_id from user_preferences
        where clerk_user_id = (auth.jwt() ->> 'sub')
      )
    )
  );

create policy responses_team_read on responses
  for select using (
    session_id in (
      select id from sessions
      where team_id in (
        select team_id from user_preferences
        where clerk_user_id = (auth.jwt() ->> 'sub')
      )
    )
  );

create policy flags_team_read on flags
  for select using (
    session_id in (
      select id from sessions
      where team_id in (
        select team_id from user_preferences
        where clerk_user_id = (auth.jwt() ->> 'sub')
      )
    )
  );

create policy scheduled_sends_team_read on scheduled_sends
  for select using (
    session_id in (
      select id from sessions
      where team_id in (
        select team_id from user_preferences
        where clerk_user_id = (auth.jwt() ->> 'sub')
      )
    )
  );

create policy question_templates_team_read on question_templates
  for select using (
    team_id in (
      select team_id from user_preferences
      where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

-- ==========================================================================
-- 10. Realtime — deliveries, responses, flags, scheduled_sends stream so
--     coach/captain dashboards update without refresh while a session is
--     in-flight.
-- ==========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'deliveries'
  ) then
    alter publication supabase_realtime add table deliveries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'responses'
  ) then
    alter publication supabase_realtime add table responses;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'flags'
  ) then
    alter publication supabase_realtime add table flags;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'scheduled_sends'
  ) then
    alter publication supabase_realtime add table scheduled_sends;
  end if;
end$$;
