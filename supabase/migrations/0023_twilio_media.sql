-- 0023: capture inbound Twilio media (photos athletes attach to texts)
--
-- Until now, twilio_messages had no media columns at all and
-- activity_logs.image_path was hard-coded null in the worker. Athletes
-- who texted a workout photo had it silently dropped.
--
-- New columns:
--   twilio_messages.media_sids  text[]   — Twilio Media SIDs for the message
--   activity_logs.media_sids    text[]   — mirrored copy when category is
--                                          workout/rehab so the activity
--                                          feed can render without joining
--
-- The browser fetches each image via /api/twilio-media/<msg>/<media>
-- which proxies through Twilio Basic Auth using the team's saved creds.
-- We don't store URLs because Twilio media URLs require auth and
-- can't be loaded directly in <img> tags anyway.

alter table public.twilio_messages
  add column if not exists media_sids text[];

alter table public.activity_logs
  add column if not exists media_sids text[];
