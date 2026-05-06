# reflect-live — Design Spec

**Course:** MPCS 51238 (Design, Build, Ship) · Spring 2026
**Assignment:** 4 — Build & Deploy a System
**Date:** 2026-04-21
**Working folder:** `reflect-live/`

---

## Overview

A real-time "team pulse" dashboard for UChicago Swim & Dive coaches. A single Railway-hosted background worker runs **two parallel poll loops**:

1. **Weather poll (every 10 min)** — Open-Meteo (free, no key) for the training pool + upcoming meet locations. This is the always-updating live data source that satisfies the assignment's rubric (updates happen on their own, independent of athlete activity).
2. **Twilio poll (every 15 s)** — Twilio Messages REST API. Tags each message by category (workout / rehab / survey / chat). This is the core integration with reflect — preserved exactly from the original design.

Both streams write to Supabase. Supabase Realtime is enabled on both `weather_snapshots` and `twilio_messages`. A Next.js frontend on Vercel subscribes to both and renders a weather grid, live message feed, aggregate metrics, per-player watchlist, and historical activity-log timeline.

Built alongside (never inside) an existing FastAPI app called `reflect` that sends the same team's SMS surveys via Twilio. `reflect-live` reads the same Twilio account but never sends, never touches reflect's codebase, and never writes to reflect's database.

---

## Goals

1. Satisfy every Assignment 4 rubric item: monorepo (`apps/web/` + `apps/worker/`), Next.js + Tailwind, Railway worker that polls a live source, Supabase store, Supabase Realtime, auth + personalization, CLAUDE.md, multiple commits, deployed live URLs.
2. Demonstrate the canonical architecture pattern: external source → poller → DB → realtime → UI.
3. Be safe to build alongside reflect without disturbing reflect's production data, deployments, or webhooks.

## Non-goals

- Sending SMS/WhatsApp (reflect owns that channel).
- Reimplementing reflect's survey state machine.
- Image upload for activity logs (we display `image_path` as a string only).
- Multi-team tenancy in MVP (only the swim team is seeded).
- Historical staleness guarantees (reflect keeps running independently; activity log snapshot is frozen at seed time).

---

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

**Safety posture:** Worker makes only `GET` calls against both APIs. Reflect's Twilio webhook is unaffected. Open-Meteo requires no key and has no rate limit concerns at 10-min cadence.

---

## Tech choices

| Concern | Choice | Why |
|---|---|---|
| Monorepo | Bun workspaces | Already using bun; Turborepo overkill at this scale |
| Frontend | Next.js 16 App Router + Tailwind v4 | Matches prior A3 work (saveur/mise), shortest ramp |
| Auth | Clerk v7 | Matches A3 pattern; known-good JWT bridge to Supabase |
| Database | Supabase Postgres | Assignment requirement |
| Realtime | Supabase Realtime | Assignment requirement |
| Worker runtime | Node + TypeScript (compiled via `tsc`) | Plain, boring, deployable anywhere |
| Twilio client | `twilio` npm package | Official; supports `messages.list({ dateSentAfter })` |
| Supabase client | `@supabase/supabase-js` | Standard |
| SQLite reader (seed) | `better-sqlite3` with `readonly: true` | Sync API; impossible to write |
| Deploy (web) | Vercel | Assignment requirement |
| Deploy (worker) | Railway | Assignment requirement |

---

## Repo layout

```
Assignment4/
├── Assignment 4.pdf                 (untouched)
└── reflect-live/
    ├── apps/
    │   ├── web/                     Next.js frontend
    │   └── worker/                  Node/TS poller
    ├── packages/
    │   └── shared/                  Types + Supabase client factories
    ├── supabase/
    │   └── migrations/              SQL schema + RLS policies
    ├── scripts/
    │   ├── seed.ts                  CSV + optional SQLite import
    │   └── verify-seed.ts           Read-only row counts
    ├── docs/
    │   └── superpowers/specs/       This spec lives here
    ├── .env.local.example
    ├── CLAUDE.md
    ├── AGENTS.md                    (optional)
    ├── package.json                 Bun workspace root
    └── README.md
```

---

## Data model

Eight tables. Realtime enabled on `twilio_messages` AND `weather_snapshots`. RLS on all except `worker_state` (service-role-only).

### `locations` (hand-seeded — training site + meet venues)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `team_id` | bigint FK → teams | |
| `name` | text | e.g. "Myers-McLoraine Pool", "Indianapolis Nationals 2026" |
| `kind` | text CHECK IN (`'training'`, `'meet'`) | |
| `lat` | double precision | |
| `lon` | double precision | |
| `event_date` | date | Null for training sites; date for meets |
| `created_at` | timestamptz default now() | |

### `weather_snapshots` · Realtime ON

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `location_id` | bigint FK → locations | |
| `team_id` | bigint FK → teams | Denormalized for RLS |
| `temp_c` | real | |
| `precip_mm` | real | Last-hour precipitation |
| `wind_kph` | real | |
| `humidity_pct` | real | |
| `condition_code` | int | Open-Meteo WMO weather code |
| `fetched_at` | timestamptz not null default now() | |

Indexes: `(location_id, fetched_at desc)`, `(team_id, fetched_at desc)`.



### `teams`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `name` | text | e.g. "UChicago Swim & Dive" |
| `code` | text UNIQUE | `'uchicago-swim'` |
| `created_at` | timestamptz default now() | |

### `players`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `team_id` | bigint FK → teams | |
| `name` | text | |
| `phone_e164` | text | Join key for Twilio messages |
| `group` | text | e.g. `'Sprint'`, `'Mid D'`, `'Distance'` |
| `active` | boolean default true | |
| `created_at` | timestamptz default now() | |
| UNIQUE(`team_id`, `phone_e164`) | | |

### `twilio_messages` · Realtime ON

| Column | Type | Notes |
|---|---|---|
| `sid` | text PK | Twilio MessageSid — natural dedupe |
| `direction` | text | `'inbound'` / `'outbound-api'` / `'outbound-reply'` |
| `from_number` | text | |
| `to_number` | text | |
| `body` | text | |
| `status` | text | queued / sent / delivered / received / failed |
| `category` | text | `'workout'` / `'rehab'` / `'survey'` / `'chat'` (worker sets on insert) |
| `date_sent` | timestamptz | Twilio's timestamp — used for polling cursor |
| `player_id` | bigint FK → players | NULL if phone doesn't match a seeded player |
| `team_id` | bigint FK → teams | Denormalized for RLS perf |
| `ingested_at` | timestamptz default now() | |

Indexes: `(team_id, date_sent desc)`, `(player_id, date_sent desc)`, `(team_id, category, date_sent desc)`.

### `activity_logs` (historical snapshot of reflect's workouts + rehabs)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `player_id` | bigint FK → players | |
| `team_id` | bigint FK → teams | |
| `kind` | text CHECK IN (`'workout'`, `'rehab'`) | |
| `description` | text | |
| `image_path` | text | Stored as-is; not fetched |
| `logged_at` | timestamptz | From reflect's original `logged_at` |
| `created_at` | timestamptz default now() | |

Indexes: `(player_id, logged_at desc)`, `(team_id, kind, logged_at desc)`.
UNIQUE index for seed idempotency: `(player_id, kind, logged_at, md5(description))`.

### `worker_state` (single row, service-role-only)

| Column | Type | Notes |
|---|---|---|
| `id` | int PK default 1 CHECK (id = 1) | |
| `last_date_sent` | timestamptz | Cursor for Twilio polling |
| `last_twilio_poll_at` | timestamptz | Most recent Twilio poll |
| `last_weather_poll_at` | timestamptz | Most recent Open-Meteo poll |
| `last_error` | text | |
| `consecutive_errors` | int default 0 | |
| `backfill_complete` | boolean default false | Flips true after initial 90-day Twilio backfill |

### `user_preferences`

| Column | Type | Notes |
|---|---|---|
| `clerk_user_id` | text PK | Clerk JWT `sub` claim |
| `team_id` | bigint FK → teams | Which team this coach manages |
| `watchlist` | bigint[] | Array of player IDs to highlight |
| `group_filter` | text | Optional: narrow dashboard to Sprint / Mid D / etc. |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | |

### RLS summary

```sql
-- user_preferences: self-only
USING (clerk_user_id = auth.jwt()->>'sub')

-- all other end-user tables: team-scoped via prefs
USING (team_id IN (
  SELECT team_id FROM user_preferences
  WHERE clerk_user_id = auth.jwt()->>'sub'
))

-- worker_state: no policy; only service role key bypasses RLS
```

---

## Worker design

Two independent intervals scheduled from `index.ts`. Each logs errors to `worker_state` independently so one stream's breakage doesn't hide the other's health.

### Weather loop (every 10 min)

For each row in `locations`, call `https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,weather_code`. Map the `current` block into a `weather_snapshots` row. Bulk `insert` (not upsert — we keep history). Supabase Realtime pushes each insert to the dashboard.

### Twilio loop (every 15 s)

Unchanged from original design. See below.

**Twilio loop (in `apps/worker/src/poll-twilio.ts`):**

```ts
while (running) {
  const state = await getWorkerState()
  const cursor = state.last_date_sent ?? daysAgo(90)  // first run = 90-day backfill
  let msgs = await twilio.messages.list({
    dateSentAfter: cursor,
    pageSize: 1000,
  })
  if (!state.backfill_complete) {
    // paginate fully until exhausted, then flip flag
  }
  const rows = msgs.map(toRow)                        // + phone → player_id lookup + categorize()
  if (rows.length) {
    await supabase.from('twilio_messages').upsert(rows, { onConflict: 'sid' })
    await updateWorkerState({ last_date_sent: max(msgs.map(m => m.dateSent)) })
  }
  await updateWorkerState({
    last_poll_at: now(),
    last_error: null,
    consecutive_errors: 0,
    backfill_complete: true,
  })
  await sleep(POLL_INTERVAL_MS)                       // default 15000
}
```

**Categorization (keyword-based, simple):**

```ts
function categorize(body: string): 'workout' | 'rehab' | 'survey' | 'chat' {
  const b = body.trim().toLowerCase()
  if (b.startsWith('workout')) return 'workout'
  if (b.startsWith('rehab')) return 'rehab'
  if (/^\d{1,2}\b/.test(b)) return 'survey'    // "8", "9 tired"
  return 'chat'
}
```

**Phone → player lookup:** worker holds a 5-minute in-memory cache of `phone_e164 → player_id`. Unmatched phones still insert with `player_id = NULL` (visible on dashboard as "Unknown sender").

**Error handling:** wrap poll body in try/catch. On error, increment `consecutive_errors`, store `last_error`. Exponential backoff: 15s → 30s → 60s capped at 5min after ≥10 consecutive errors. Never crash the process.

**Shutdown:** SIGTERM flips `running = false`, current iteration completes, process exits clean.

**Twilio quota:** one REST call per 15s = 5760 calls/day per environment. Well under account limits.

---

## Frontend design

### Pages

| Route | Auth | Purpose |
|---|---|---|
| `/` | public | Landing + sign in/up CTA |
| `/sign-in`, `/sign-up` | public | Clerk-hosted |
| `/onboarding` | signed-in | First-time user picks team + watchlist → writes `user_preferences` |
| `/dashboard` | signed-in | Main view |
| `/dashboard/player/[id]` | signed-in | Per-player drill-down: messages + activity_logs timeline |

### Dashboard layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  reflect-live       [team: UChicago Swim & Dive]       [user menu]    │
├────────────────────────────────────────────────────────────────────────┤
│  [Messages today] [Active players] [Response rate] [Worker health]    │
├────────────────────────────────────────────────────────────────────────┤
│  LIVE FEED (Realtime)                │  WATCHLIST                      │
│  [All] [Workout] [Rehab] [Survey]    │  ⭐ players with latest msg     │
│  stream of tagged messages           │                                 │
├────────────────────────────────────────────────────────────────────────┤
│  RECENT ACTIVITY LOGS (from reflect snapshot, static)                 │
│  Timeline of workouts + rehabs across the team                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Components

- `Nav` — Clerk `<Show when="signed-in">` pattern
- `MetricCard` — single stat + trend indicator
- `LiveFeed` — Supabase Realtime subscription on `twilio_messages`, filtered by `team_id`, with category filter chips
- `WatchlistPanel` — reads `user_preferences.watchlist`
- `ActivityLogTimeline` — reads `activity_logs` (static)
- `WorkerHealthCard` — polls `worker_state` every 10s (plain fetch)
- `StarButton` — toggles player in `user_preferences.watchlist`

### Realtime subscription

```ts
supabase
  .channel('messages')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'twilio_messages',
      filter: `team_id=eq.${teamId}` },
    (p) => prependMessage(p.new))
  .subscribe()
```

---

## Auth — Clerk ↔ Supabase JWT bridge

1. User signs in via Clerk → JWT with `sub` = user ID.
2. Next.js client fetches token using template `"supabase"` via `useAuth().getToken({ template: 'supabase' })`.
3. Token attached as `Authorization: Bearer` on every Supabase request.
4. RLS policies read `auth.jwt()->>'sub'` and match against `user_preferences.clerk_user_id`.
5. Clerk JWT template signed HS256 using Supabase's JWT secret (configured once in both dashboards).

**Onboarding gate:** Next.js middleware redirects signed-in users without a `user_preferences` row to `/onboarding`. Prevents blank-dashboard state.

---

## Seed script (`scripts/seed.ts`)

**Phase 1 (always runs):**
1. Parse `swim_team_contacts.csv` (name, phone E.164, group).
2. Insert single team: `{ name: 'UChicago Swim & Dive', code: 'uchicago-swim' }`.
3. Insert each row as a player with the group tag.

**Phase 2 (runs only if `REFLECT_DB_COPY_PATH` env var is set):**
1. Refuse if path contains `reflect/data/` (hard string check).
2. Open SQLite in read-only mode (`better-sqlite3` `readonly: true`).
3. Build phone set from seeded swim players.
4. Join reflect's `workouts` → `players` → filter to swim phones:
   ```sql
   SELECT w.description, w.image_path, w.logged_at, p.phone_e164
   FROM workouts w
   JOIN players p ON p.id = w.player_id
   WHERE p.phone_e164 IN (<swim phones>)
   ```
   Map each row's `phone_e164` back to the new Supabase `player_id`, then insert into `activity_logs` with `kind='workout'`.
5. Same pattern for `rehabs` → `activity_logs` with `kind='rehab'`.
6. Idempotency: add a UNIQUE index `activity_logs_dedupe ON (player_id, kind, logged_at, md5(description))` and use `INSERT ... ON CONFLICT DO NOTHING`. Safe to re-run.

If reflect's prod DB has no swim players (e.g., reflect is tennis-only today), Phase 2 simply inserts zero rows — not an error.

**Operator runbook:**

```bash
# Optional — download reflect prod DB for historical activity logs
curl -H "X-Admin-Key: $ADMIN_KEY" \
  https://<reflect-railway-url>/admin/download-db \
  -o /tmp/reflect-prod.db

# Run seed
cd Assignment4/reflect-live
REFLECT_DB_COPY_PATH=/tmp/reflect-prod.db \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  bun run scripts/seed.ts

# Clean up
rm /tmp/reflect-prod.db
```

Phase 2 is silently skipped if `REFLECT_DB_COPY_PATH` is unset.

**Confirmation prompt:** Before any inserts, script prints a preview ("Will insert 1 team, 21 players, N activity logs into Supabase project `<url>`") and requires `y` or `--yes` flag.

---

## Deployment

### Vercel (web)

- Root directory: `apps/web`
- Build: `cd ../.. && bun install && bun run --cwd apps/web build`
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Auto-deploys on push to `main`.

### Railway (worker)

- Root directory: `apps/worker`
- Start: `node dist/index.js` (after `tsc` build)
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `POLL_INTERVAL_MS=15000`
- Restart on failure, max 3 retries. No exposed port.
- Auto-deploys on push to `main`.

### Supabase

- Single project: `reflect-live`
- Schema + RLS applied via migrations (Supabase MCP, per assignment requirement)
- Realtime enabled on `twilio_messages` only
- Clerk JWT secret pasted into Supabase Auth settings

### GitHub

- Standalone repo `reflect-live` (separate from any reflect repo)
- Single branch `main`
- `.env.local` gitignored; `.env.local.example` committed

---

## Guardrails (how we honor the three stated constraints)

### 1. Never touch reflect's codebase or deployment

- All new files under `Assignment4/reflect-live/`.
- Separate GitHub repo.
- Separate Vercel + Railway projects.
- Reflect's webhook URL, Twilio phone number, templates: unchanged.
- Reflect's Railway env vars, volume, DB path: unchanged.

### 2. Never mutate reflect's data

- Seed script hard-refuses paths containing `reflect/data/`.
- SQLite opened with `readonly: true`.
- Seed only reads from a *copy* placed in `/tmp`.
- Interactive confirmation before first insert.
- Twilio polling is `GET`-only; no consume, no delete, no state change in Twilio.

### 3. Follow the assignment rubric precisely

| Requirement | Satisfied by |
|---|---|
| Monorepo `apps/web/` + `apps/worker/` | Repo layout above |
| Next.js + Tailwind | Web app |
| Railway worker polling external source | Worker loop |
| Supabase store, worker writes / frontend reads | Schema + access pattern |
| Supabase Realtime | Enabled on `twilio_messages`, consumed in dashboard |
| Auth (Clerk or Supabase) | Clerk v7 |
| Personalization | `user_preferences` (team, watchlist, group filter) |
| Env vars in `.env.local` + platform dashboards | Env table above |
| Supabase MCP configured | Migrations applied via MCP |
| CLAUDE.md | Written during implementation |
| Multiple git commits | Natural from phased build |
| Deployed to Vercel + Railway with live URLs | Deployment section |

---

## Out of scope

- SMS sending, outbound messaging.
- Reimplementing reflect's survey state machine.
- Session / delivery / flag tables (empty without reflect-side logic).
- Image uploads for activity logs.
- Multi-team onboarding.
- Rich charts (sparkline text-indicator is enough for MVP).
- Email/push notifications.

---

## Open operator actions before implementation

- [ ] Create new Supabase project `reflect-live`, capture URL + anon key + service role key.
- [ ] Create new Clerk application, capture publishable key + secret, create JWT template `supabase` (HS256 with Supabase JWT secret).
- [ ] Create new GitHub repo `reflect-live`.
- [ ] Optional: `curl` reflect's `/admin/download-db` to capture prod activity logs for seeding.
- [ ] Confirm Twilio Account SID + Auth Token (reused from reflect).
