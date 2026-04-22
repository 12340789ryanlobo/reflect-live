-- Phase 2.7 — phone OTP self-serve linking (used when Clerk's native phone
-- support is Pro-gated). Uses our existing Twilio account to SMS a 6-digit
-- code, verify it, and link the user's phone to their roster entry.

create table if not exists phone_verifications (
  id bigint generated always as identity primary key,
  clerk_user_id text not null,
  team_id bigint not null references teams(id),
  phone_e164 text not null,
  code text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_phone_verif_user on phone_verifications(clerk_user_id, created_at desc);
create index if not exists idx_phone_verif_lookup on phone_verifications(clerk_user_id, phone_e164, created_at desc);

-- RLS on, no policies → only the service role (the API routes) can read/write.
-- The anon + authenticated roles cannot see or guess codes.
alter table phone_verifications enable row level security;
