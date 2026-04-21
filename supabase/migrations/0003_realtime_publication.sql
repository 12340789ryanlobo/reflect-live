-- Phase 2.3 — enable Realtime on streaming tables
alter publication supabase_realtime add table twilio_messages;
alter publication supabase_realtime add table weather_snapshots;
