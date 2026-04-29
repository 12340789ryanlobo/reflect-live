-- 0018_llm_cache.sql
--
-- LLM response cache. Keyed by (player_id, days, hash-of-input-data) so
-- repeated calls within the cache TTL window short-circuit and don't burn
-- API credits. Service-role only — RLS not enabled because nothing in the
-- web app should hit this directly.
--
-- Idempotent.

create table if not exists public.llm_cache (
  cache_key     text primary key,
  response      jsonb not null,
  generated_by  text not null check (generated_by in ('llm', 'rules')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_llm_cache_created_at on public.llm_cache (created_at desc);

-- No RLS — service-role only. We explicitly *don't* enable it so the
-- service-role client doesn't hit policy churn on every read/write.
alter table public.llm_cache disable row level security;
