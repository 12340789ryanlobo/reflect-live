-- 0022: per-player additional phone numbers
--
-- International students often carry a US number AND a home-country
-- number. Until now `players.phone_e164` was the single source — the
-- worker matched inbound SMS only against that, so messages from the
-- 'wrong' number got orphaned.
--
-- New table: player_phones — one row per phone an athlete owns.
-- Exactly one row per player is_primary=true; that row's e164 is
-- mirrored back to players.phone_e164 by application logic so
-- existing leaderboard / heatmap queries don't have to JOIN.
--
-- Backfills every existing players.phone_e164 as a primary row.
-- After this migration the worker should match against
-- player_phones.e164 instead of players.phone_e164.

create table if not exists public.player_phones (
  id           bigserial primary key,
  player_id    bigint not null references public.players(id) on delete cascade,
  e164         text   not null,
  label        text,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (player_id, e164)
);

-- One primary per player. Allows multiple alternates with is_primary=false.
create unique index if not exists player_phones_one_primary
  on public.player_phones(player_id)
  where is_primary;

-- Inbound SMS lookup by phone — covers all numbers, not just primary.
create index if not exists player_phones_e164_idx
  on public.player_phones(e164);

-- Backfill from the existing denormalized column. Each player's
-- current phone becomes the primary row.
insert into public.player_phones (player_id, e164, is_primary)
select id, phone_e164, true
from public.players
where phone_e164 is not null and phone_e164 <> ''
on conflict (player_id, e164) do nothing;

-- RLS — match the access pattern used elsewhere: service-role bypass
-- (all writes go through the API), browser reads scoped to team
-- members. Keeping it permissive for now since the API surface is
-- the gatekeeper.
alter table public.player_phones enable row level security;

drop policy if exists "team members read player_phones" on public.player_phones;
create policy "team members read player_phones" on public.player_phones
  for select using (
    exists (
      select 1
      from public.team_memberships tm
      join public.players p on p.team_id = tm.team_id
      where p.id = player_phones.player_id
        and tm.clerk_user_id = (auth.jwt() ->> 'sub')
        and tm.status = 'active'
    )
  );
