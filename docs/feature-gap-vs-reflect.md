# reflect-live vs reflect — feature gap

Reflect is the upstream Flask app that *sends* SMS surveys and receives replies via Twilio webhooks. `reflect-live` is the **read-only real-time dashboard** we built for Assignment 4. Some of reflect's features don't port across the architecture boundary.

## What we have ✓

| Feature | Route | Notes |
|---|---|---|
| Coach dashboard (team pulse, live feed, watchlist, activity) | `/dashboard` | |
| Captain pulse (aggregate, no private message bodies) | `/dashboard/captain` | |
| Captain follow-up list | `/dashboard/captain/follow-ups` | |
| Athlete personal view | `/dashboard/athlete` | admin demo mode |
| Players roster + search + filters | `/dashboard/players` | |
| Player detail | `/dashboard/player/[id]` | |
| Fitness (workouts + rehabs + past activity) | `/dashboard/fitness` | |
| Events / upcoming meets with weather + countdowns | `/dashboard/events` | |
| Weather per training/meet venue (Open-Meteo, 10-min polling) | dashboard + events | |
| Live message feed (Twilio, 15 s polling) | dashboard | |
| Admin overview + system + database pages | `/dashboard/admin/*` | |
| Admin user & role management | `/dashboard/admin/users` | |
| Admin team management + per-team Twilio creds | `/dashboard/admin/teams` | |
| Onboarding with team picker | `/onboarding` | |
| ⌘K command palette | global | |
| Role-based navigation (admin / coach / captain / athlete) | sidebar | |

## What reflect has that we don't

| Reflect feature | Why we don't have it | Fix-path |
|---|---|---|
| **Schedule outbound SMS sends** | We're read-only by design — sending belongs in reflect | Out of architectural scope |
| **Sessions list / detail** | Reflect models each outbound broadcast as a "session"; we only see resulting inbound messages | Could add a `sessions` table + a daily rollup job that groups inbounds by day/activity window |
| **Question templates** | Only matters if you're sending | Out of scope |
| **Body-map injury heatmap** | Requires parsing "rehab: …" message bodies for body-part mentions | Doable; needs NLP or keyword table + an SVG overlay |
| **AI chat / digest** | Requires LLM integration | Out of Assignment 4 scope |
| **Captain/player password logins** | We use Clerk for everything | Different auth model, not reproducible here |
| **Team settings (question set, principles, chart metrics)** | Config of the surveying app | Out of scope |
| **CSV export of responses** | Admin convenience | Easy to add — `/dashboard/admin/database` could gain "Export" buttons |

## What we do that reflect doesn't

- **Weather grid** — training + meet weather pulled from Open-Meteo every 10 min.
- **⌘K command palette** — instant player/page jump.
- **Real-time live feed** — Supabase Realtime push for new inbound messages.
- **Per-team Twilio credentials** — multi-team ready.
- **Athlete simulation mode** — admin can preview any athlete's view.

## Multi-team problems we've addressed

- `teams` table has per-team Twilio creds (SID, auth token, phone number). Worker will fall back to env if blank.
- `teams_public` view exposes safe columns only (no secrets) to the browser.
- Admin "Teams" page creates teams + edits their Twilio config.
- Onboarding shows team picker when >1 team exists.
- RLS scopes every read by `user_preferences.team_id`.

## Multi-team problems still to solve

1. **Worker isn't multi-team aware yet** — currently polls one account via env vars. Needs to iterate teams, use per-team creds.
2. **Unknown-phone attribution** — with multiple teams the worker can't default unmatched inbounds to team 1. Should match by `to_number` (each team owns a Twilio number).
3. **User in multiple teams** — `user_preferences` is 1:1 with Clerk user. A user on two teams would need a join table (`memberships`).
4. **Team-admin vs sysadmin** — admin role is effectively global right now. True multi-tenant needs team-scoped admin + a separate sysadmin.
5. **Per-team seeding** — `seed-from-reflect-api.ts` is hard-coded to reflect team_id=4 → `uchicago-swim`. Should accept a team mapping.

## Port ideas from `docs/ideas.md` we could pull in

- **Automatic flagging** — survey readings ≤ 4 already show as "flags"; could add a flagged-items panel with who to call.
- **Fitness tracking with structured questions** — would need a check-in flow in reflect (sender-side).
- **Heatmap intensity normalized by team size** — worth tackling once we have a heatmap at all.
- **Track who is/isn't set up** — admin `/dashboard/admin/users` already lists everyone; could cross-reference against expected roster.
