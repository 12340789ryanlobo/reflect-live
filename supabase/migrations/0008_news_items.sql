-- Phase 2.8 — polled swim news feed (replaces weather as the dashboard's
-- "live content" source). News is global, not team-scoped: every team
-- sees the same SwimSwam headlines.

create table if not exists news_items (
  id bigint generated always as identity primary key,
  source text not null,               -- 'swimswam', future sources can extend
  title text not null,
  url text not null unique,           -- also the dedupe key on upsert
  summary text,
  image_url text,
  published_at timestamptz,
  ingested_at timestamptz not null default now()
);
create index if not exists idx_news_published on news_items(published_at desc);

alter table news_items enable row level security;
drop policy if exists "news readable" on news_items;
create policy "news readable" on news_items for select to authenticated using (true);

-- Enable Realtime so the dashboard updates live when a new story lands
alter publication supabase_realtime add table news_items;
