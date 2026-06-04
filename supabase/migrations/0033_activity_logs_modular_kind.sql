-- 0033: open up activity_logs.kind for modular per-competition kinds.
--
-- The original 0001 schema locked kind to ('workout','rehab') via a
-- CHECK constraint, which made sense when the only SMS prefixes the
-- reflect webhook understood were Workout: and Rehab:. Competitions
-- (migration 0029) made the scoring map open-ended (swim, lift, throw,
-- ...), but activity_logs couldn't actually store rows with those
-- kinds — the worker's dual-write would have failed the constraint.
--
-- Replace the enum-style CHECK with a shape-only check: any non-empty
-- lowercase token up to 32 chars. The reflect webhook is the
-- authoritative gate (validates each prefix against the team's live
-- competition scoring keys before saving); this constraint just keeps
-- bad data from sneaking in.

alter table activity_logs
  drop constraint if exists activity_logs_kind_check;

alter table activity_logs
  add constraint activity_logs_kind_check
  check (kind ~ '^[a-z][a-z0-9_-]{0,31}$');

comment on column activity_logs.kind is
  'Activity type the SMS prefix declared (workout, rehab, swim, lift, ...). Lowercase token, validated against teams active competition scoring keys at reply time.';
