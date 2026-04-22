# reflect-live

Real-time team-pulse dashboard for UChicago Swim & Dive.
**Assignment 4 · MPCS 51238 · Spring 2026**

- **Architecture:** `CLAUDE.md`
- **Design spec:** `docs/superpowers/specs/2026-04-21-reflect-live-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-04-21-reflect-live-implementation.md`

## Prerequisites

- Bun (1.1+)
- Supabase project with the three migrations in `supabase/migrations/` applied (in order)
- Clerk application with a JWT template named `supabase` (HS256, signing key = Supabase JWT Secret)
- Twilio account (Account SID + Auth Token — reused from the reflect app; no new numbers or webhooks)
- Supabase MCP configured: `claude mcp add --transport http supabase https://mcp.supabase.com/mcp`

## Local dev

```bash
bun install

cp apps/web/.env.local.example apps/web/.env.local         # fill values
cp apps/worker/.env.local.example apps/worker/.env.local   # fill values

# Terminal 1 — worker
bun run dev:worker

# Terminal 2 — web
bun run dev:web
# open http://localhost:3000
```

## Seed data

```bash
# Phase 1 — swim roster (always)
SUPABASE_URL=<...> SUPABASE_SERVICE_ROLE_KEY=<...> \
  bun run scripts/seed.ts

# Phase 2 — locations for the weather worker (required for the weather loop to have anything to poll)
SUPABASE_URL=<...> SUPABASE_SERVICE_ROLE_KEY=<...> \
  bun run scripts/seed-locations.ts

# Optional — import historical workouts/rehabs from reflect's prod DB
curl -H "X-Admin-Key: $REFLECT_ADMIN_KEY" \
  https://<reflect-url>/admin/download-db -o /tmp/reflect-prod.db

REFLECT_DB_COPY_PATH=/tmp/reflect-prod.db \
SUPABASE_URL=<...> SUPABASE_SERVICE_ROLE_KEY=<...> \
  bun run scripts/seed.ts

rm -f /tmp/reflect-prod.db
```

The seed script hard-refuses paths containing `reflect/data/` and opens any SQLite copy in read-only mode. Reflect's actual DB is never touched.

## Tests

```bash
bun --cwd apps/worker test    # 13 tests across 4 files
bun --cwd scripts test        # 6 tests across 2 files
```

## Deploy

| Service | Platform | Root | Build | Start |
|---|---|---|---|---|
| Web | Vercel | `apps/web` | `bun install && bun run build` | (Next auto) |
| Worker | Railway | `apps/worker` | `bun install && bun run build` | `node dist/index.js` |

Environment variables (set in each platform's dashboard):

- **Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server route only)
- **Railway:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `POLL_INTERVAL_MS=15000`, `WEATHER_INTERVAL_MS=600000`, `BACKFILL_DAYS=90`

After both are deployed, add the Vercel production URL to Clerk's allowed origins.

## Project layout

```
apps/
  web/         Next.js + Tailwind + Clerk, dashboard + player drill-down
  worker/      Dual poll loop (Twilio + Open-Meteo), TDD-tested units
packages/
  shared/      Type definitions used by both apps
scripts/
  seed.ts              CSV roster + optional reflect-DB activity import
  seed-locations.ts    Training pool + upcoming meet venues
  parse-csv.ts         Tested CSV parser
  path-guard.ts        Refuses paths containing reflect/data/
supabase/
  migrations/  0001 schema · 0002 RLS · 0003 realtime publication
data/
  swim_team_contacts.csv   21-member roster
docs/
  superpowers/specs/   design spec
  superpowers/plans/   implementation plan
```

## Key safety properties

- Never reads or writes reflect's repo, SQLite file, or Railway volume.
- Worker polls Twilio with GET only (read-only); reflect's webhook keeps receiving every message normally.
- Both systems observe the same Twilio message log independently — zero conflict.
- Seed script refuses to touch any path containing `reflect/data/`; SQLite copies open read-only.
