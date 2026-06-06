-- supabase/migrations/0034_twilio_messages_soft_delete.sql
--
-- Soft-delete for SMS + self-report rows. Coaches and athletes hide
-- mistake entries via DELETE endpoints that flip hidden = true; all
-- read paths add `WHERE hidden = false`. Pattern mirrors the
-- activity_logs.hidden treatment from migration 0010.
--
-- session_id groups multi-row self-report submissions (one outbound
-- question row + one inbound answer row per answered question, all
-- written in one POST /api/self-report burst). The DELETE endpoint
-- can then hide the whole session with one UPDATE.
--
-- NULL session_id = ingested SMS row (no grouping needed; deletion of
-- those goes through activity_logs.hidden instead).

alter table twilio_messages
  add column if not exists hidden boolean not null default false;

alter table twilio_messages
  add column if not exists session_id text;

-- Visible-rows partial index for the dominant read path. Same trick
-- the activity_logs.hidden migration used.
create index if not exists idx_twm_player_visible_date
  on twilio_messages (player_id, date_sent desc)
  where hidden = false;

create index if not exists idx_twm_session
  on twilio_messages (session_id)
  where session_id is not null;

-- ─── Backfill ────────────────────────────────────────────────────
-- Best-effort grouping of historical 'web-self-*' rows into sessions
-- by time-burst (5s window around an anchor row of the same player).
-- A 'web-self-q-*' outbound + paired 'web-self-a-*' inbound, plus any
-- legacy single-row 'web-self-<uuid>' readiness submissions, all get
-- session_id stamped so the UI doesn't need a separate code path for
-- pre-migration rows.

update twilio_messages t
   set session_id = anchor.sid
  from (
    select sid, player_id, date_sent
    from twilio_messages
    where sid like 'web-self-q-%' or sid like 'web-self-%'
  ) anchor
 where t.session_id is null
   and t.player_id is not null
   and t.player_id = anchor.player_id
   and t.date_sent >= anchor.date_sent
   and t.date_sent <= anchor.date_sent + interval '5 seconds'
   and (t.sid like 'web-self-%' or t.sid = anchor.sid);

-- Fallback: any remaining 'web-self-%' row without a session_id gets
-- its own sid as session_id (one-row session).
update twilio_messages
   set session_id = sid
 where session_id is null
   and sid like 'web-self-%';
