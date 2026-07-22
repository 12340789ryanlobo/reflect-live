# reflect-live

**Course:** MPCS 51238 · Spring 2026 · Assignment 4 · **Team:** UChicago Swim & Dive

Real-time team-pulse dashboard. One Railway worker runs two poll loops →
Supabase (Realtime on) → Next.js on Vercel. Built alongside (never inside) the
existing `reflect` FastAPI app; same Twilio account, zero impact on reflect.

```
Open-Meteo ──►┌ Worker (Railway) ─────────────┐
Twilio Msgs ─►│ weather loop (10m) → Supabase  │─► Supabase Postgres + Realtime
              │ twilio  loop (15s) → Supabase  │   ─► Next.js (Vercel) + Clerk, RLS
              └───────────────────────────────┘
```

- **Web** — `apps/web/` · Next.js 16 App Router · Tailwind v4 · Clerk v7 · Vercel
- **Worker** — `apps/worker/` · Node + TypeScript · Railway
- **Shared** — `packages/shared/` · workspace-linked types
- **Scripts** — `scripts/` · seed team/players/locations (path-guarded, read-only on reflect)
- **DB** — Supabase Postgres; SQL in `supabase/migrations/` (sequential `00XX_name.sql`, currently …0034)

Deeper detail lives in the code and these docs — read them, don't restate here:
schema → `supabase/migrations/`, design → `docs/superpowers/specs/`, plans →
`docs/superpowers/plans/`, what's shipped → `docs/shipped.md`.

## Commands

| Task | Command |
|------|---------|
| Web dev | `bun run dev:web` |
| Worker dev | `bun run dev:worker` |
| Build web | `bun run build:web` |
| Typecheck | `bun run typecheck` (web; worker runs via bun, no tsc gate) |
| Lint | `bun run lint` (eslint + react-hooks) |
| Test | `bun run test` (worker + scripts) |
| Seed | `bun run scripts/seed.ts` then `scripts/seed-locations.ts` |

## Definition of done (run before claiming a web change works)

1. `bun run typecheck` — clean
2. `bun run lint` — clean (catches the rules-of-hooks bugs that used to ship silently)
3. `bun run build:web` — succeeds
4. Only after 1–3 are green, commit + push.

A 200 in Vercel logs ≠ the page rendered. Build success ≠ runtime success.
If a change touches a hook or a Realtime subscription, say what you actually
verified, not what you assume.

## Conventions

- TypeScript ES modules (import/export), never CommonJS.
- API routes: `apps/web/src/app/api/**/route.ts`. Pages: `apps/web/src/app/**`.
- New DB change = a new `supabase/migrations/00XX_name.sql` (next number, never
  edit a shipped migration). Note in the PR/commit that it must be applied in
  the Supabase SQL editor.
- RLS: every end-user table scoped via `user_preferences.team_id` matched
  against `auth.jwt()->>'sub'`. `worker_state` has no RLS (service role only).
- Don't add comments/docstrings/type annotations to code you didn't change.
- Match the surrounding code's idiom, naming, and comment density.

## Gotchas (learned the hard way)

- **NEXT_PUBLIC_* env vars must be scoped to all environments**, not
  Production-only — Production-only breaks branch/Preview builds with
  "supabaseUrl is required". (see auto-memory)
- The worker is the only writer to `twilio_messages` / `weather_snapshots`;
  the web app reads via Realtime. Don't write those tables from the web.
- Twilio is **GET-only** from this worker — reflect's webhook is untouched;
  both systems observe the same message log independently.

## Safety toward reflect (non-negotiable)

- Separate GitHub repo / Vercel project / Railway project.
- Seed scripts hard-refuse any path containing `reflect/data/` and open SQLite
  copies read-only. **Zero writes to reflect's SQLite, ever.**

## How we work (workflow contract)

- **Backlog** lives in `IDEAS.md`. Ryan owns the **Inbox** (raw thoughts).
  Claude only reorganizes IDEAS.md when explicitly told ("fold the inbox" /
  "update ideas") — never silently — and warns to save first, then makes
  surgical edits so unsaved typing is never clobbered. Shipped work is appended
  to `docs/shipped.md`, not IDEAS.md.
- **Plan first for anything non-trivial.** Use plan mode (Shift+Tab) on
  multi-file features; get the decomposition reviewed before writing code.
  Cheap to be wrong in a plan, expensive to be wrong after 200k tokens.
- **Delegate exploration to subagents** (research, multi-file search, log
  trawls) to keep the main context clean — return only the findings.
- **Default: work directly on `main`, push every time.** Commit straight to
  `main` and push after every change — no feature branch or PR required.
  **Always `git pull --ff-only` (or `--rebase`) immediately before pushing** so
  local `main` is up to date first (another session may have pushed). Stage
  specific files, never `git add .`. Run the Definition of done (typecheck +
  lint + build:web) before pushing. Vercel auto-deploys `main` to production —
  don't wait to be asked.
- **Worktrees only for genuinely parallel multi-session work** (two+ agents
  running at once): `claude --worktree <name>`, one branch each, mark in-flight
  items on IDEAS.md's Backlog **Active now** line with `[wt:<name>]`, merge to
  main one at a time. For
  normal single-session work, skip branches and push to `main` directly.
