-- 0020: TTL throttle for llm_cache.
--
-- Existing cache_key (full hash) catches identical inputs. throttle_key
-- (per-player+period only, no data hash) lets us serve a cached row even
-- when data has shifted slightly, capping LLM calls at one per
-- LLM_CACHE_TTL_HOURS per (player, period).

alter table public.llm_cache
  add column if not exists throttle_key text;

create index if not exists idx_llm_cache_throttle
  on public.llm_cache (throttle_key, created_at desc);
