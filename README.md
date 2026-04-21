# reflect-live

Real-time team-pulse dashboard for UChicago Swim & Dive.

**Assignment 4 · MPCS 51238 · Spring 2026**

See `CLAUDE.md` for architecture and `docs/superpowers/specs/2026-04-21-reflect-live-design.md` for the full design spec.

## Quickstart
1. Create Supabase, Clerk, Twilio accounts (see `CLAUDE.md` → Setup).
2. Copy `.env.local.example` to `.env.local` in each app and fill in values.
3. Apply Supabase migrations (see `supabase/migrations/`).
4. `bun install`
5. Run worker: `bun run dev:worker`
6. Run web: `bun run dev:web`
7. Seed: `bun run seed`
