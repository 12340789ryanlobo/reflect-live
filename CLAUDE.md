# reflect-live Architecture

**Course:** MPCS 51238 · Spring 2026 · Assignment 4
**Team:** UChicago Swim & Dive

## Overview

Real-time team-pulse dashboard. A single Railway worker runs two independent poll loops:
- **Weather poll (every 10 min)** — Open-Meteo (free, no key) for the training pool + upcoming meet locations. This is the always-updating live data source the rubric asks for.
- **Twilio poll (every 15 s)** — Twilio Messages REST API. Tags each message by category (workout / rehab / survey / chat). This is the integration with an existing FastAPI app (`reflect`) that sends swim-team SMS surveys via Twilio.

Both streams write to Supabase; Realtime is enabled on both and the Next.js frontend subscribes to each.

Built alongside (never inside) the existing `reflect` app. Same Twilio account, zero impact on reflect's code, data, or deployments.

## Architecture

```
                       ┌───────────────────────────────────────┐
                       │           Worker (Railway)            │
Open-Meteo ──────────► │  weather loop (10m) → Supabase        │ ─► Supabase
                       │  twilio loop  (15s) → Supabase        │   Postgres
Twilio Messages ─────► │                                       │   + Realtime on
                       └───────────────────────────────────────┘   weather_snapshots
                                                                  + twilio_messages
                                                                         │
                                                                         ▼
                                                                   Next.js (Vercel)
                                                                   + Clerk, RLS by team
```

## Services

- **Worker** — `apps/worker/` · Node + TypeScript · Railway
- **Web** — `apps/web/` · Next.js 16 App Router · Tailwind v4 · Clerk v7 · Vercel
- **Shared** — `packages/shared/` · workspace-linked type definitions
- **Seed scripts** — `scripts/` · CSV parser, path guard, seed team/players + optional reflect-DB activity log import, seed locations
- **Database** — Supabase Postgres (`supabase/migrations/` holds the SQL)

## Data flow

**Twilio path:**
1. Worker reads `worker_state.last_date_sent` cursor.
2. Calls `twilio.messages.list({ dateSentAfter: cursor, pageSize: 1000 })`.
3. Each message: categorize (workout / rehab / survey / chat), resolve phone → player_id via 5-min LRU, upsert into `twilio_messages` (dedup on `sid`).
4. Supabase Realtime fires `INSERT` → dashboard prepends to live feed without refresh.

**Weather path:**
1. Worker reads all `locations` rows.
2. For each, GETs `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=...`.
3. Inserts snapshot into `weather_snapshots`.
4. Realtime fires `INSERT` → `WeatherGrid` updates the card for that location in place.

## Schema (8 tables)

- `teams` — team identity (single row: UChicago Swim & Dive)
- `players` — swim roster, seeded from `data/swim_team_contacts.csv`
- `twilio_messages` — **Realtime ON**, worker writes, dedup on `sid`, indexed by team/date/category
- `activity_logs` — historical workouts + rehabs (optional one-time import from reflect's prod DB)
- `locations` — training pool + upcoming meet venues (hand-seeded)
- `weather_snapshots` — **Realtime ON**, worker inserts every 10 min per location
- `worker_state` — single-row cursor + last-poll timestamps + error count (service role only)
- `user_preferences` — per-Clerk-user team + watchlist + group filter

## RLS

All end-user tables are scoped via `user_preferences.team_id` matched against `auth.jwt()->>'sub'`. `worker_state` has no RLS and is only touched by the worker's service-role client.

## Safety stance toward reflect

- Separate GitHub repo, Vercel project, Railway project.
- Worker polls Twilio via GET only — reflect's webhook is unaffected, both systems observe the same message log independently.
- Seed script hard-refuses paths containing `reflect/data/` and opens SQLite copies in read-only mode.
- Zero writes to reflect's SQLite file ever.

## Setup (summary — full runbook in README.md)

1. Supabase project — apply three migration SQL files from `supabase/migrations/` in order.
2. Clerk application — create JWT template named `supabase` signed with Supabase's JWT secret.
3. Twilio credentials reused from the existing reflect account (read-only).
4. `bun install` at repo root.
5. Seed: `bun run scripts/seed.ts` then `bun run scripts/seed-locations.ts`.
6. Run: `bun run dev:worker` (one terminal) + `bun run dev:web` (another).
7. Deploy: Vercel for `apps/web`, Railway for `apps/worker`.

## Design doc

`docs/superpowers/specs/2026-04-21-reflect-live-design.md`

## Implementation plan

`docs/superpowers/plans/2026-04-21-reflect-live-implementation.md`
