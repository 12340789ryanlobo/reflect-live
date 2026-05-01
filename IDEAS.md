# Reflect-Live Ideas + Backlog

Living doc. Three sections: what's shipped, what's in flight, what's next.
Every item the original list mentioned is preserved — just routed to the
section it actually belongs in.

---

## ✅ Shipped

### Auth / role boundaries
- Athlete role can no longer see admin/coach surfaces (A1)
- Athlete view leaked from another login — fixed
- Athlete can see their team's fitness/leaderboard tab (peer accountability)
- Captain who's also on the roster gets a personal "My view" → their own
  `/dashboard/players/[id]` page, with self-affordances (Self-report /
  Log workout / Report injury), not the coach affordances
- Athlete settings page no longer shows the coach-only "Default group filter"

### Onboarding / membership
- Join request → coach approval flow with SMS decision notification
- Pending banner + sidebar Requests entry that hides when count is 0
  and surfaces with a red badge when there's something to triage
- Coach can self-serve a new team; platform admin can configure
  `require_team_approval` globally
- Per-user team switcher in the sidebar header

### Athlete page (C1 — design-language anchor)
- Hero: readiness bar + AI sentence + period toggle + inline action row
- Identity card: name, group, status pill, last-on-wire, phone, **season
  rank** (#3 / 18 with `since YYYY-MM-DD` caption when a season is set)
- Body heatmap with three tabs (**Activity / Injury / Rehab**, Activity
  is the default left-most tab)
- Click a muscle on the heatmap → timeline filters to entries that
  mention that region; "Filtered by:" pill clears it
- Personal counters: workouts / rehabs / surveys / flags
- Click into an athlete → sidebar tab highlights correctly (canonical URL)

### Heatmap + body taxonomy
- One slug ↔ one canonical region rule across the whole map
- bicep / tricep / abs / obliques split out, joints (elbow, wrist, achilles)
  excluded from activity heatmap (joints are real for injury but not
  "muscles worked")
- Density legend with actual count ranges (0, 1, 2-3, 4-5, etc.)
- Hover tooltip with cursor-following region label

### Coach scoring + season window
- Fitness scoring + leaderboard (Phase 1)
- `team.competition_start_date` + coach-editable "Season start" in
  `/dashboard/settings` — drives season-rank window; null = all-time

### LLM summaries (Phase 5)
- `llm_cache` table with input-hash + 24h throttle keys
- Summary now ingests **activity_logs, injury_reports, twilio_messages**
  on top of session responses + flags (the team's actual data flow)
- Hero renders `summary` + collapsible `observations` (•) +
  `recommendations` (→ ArrowRight) + LLM/Rules pill + confidence pill;
  "View analysis" button is collapsed by default so it isn't invasive
- Prompt rewrites recent-half vs earlier-half comparisons + samples
  raw inbound SMS bodies when no readiness number was parseable

### Sessions / scheduler shadow mode (Phase 3, partial)
- Schema migration, ts port of survey_engine, sessions list/detail UI,
  templates editor, schedule UI, worker reminder scheduler + dry-run
  twilio sender. Shadow soak diff tooling still pending.

---

## ⚠️ Action required (before next ship)

- **Apply migration `supabase/migrations/0021_competition_start_date.sql`**
  via the Supabase SQL editor. Until then the season-rank fetch and the
  Season-start settings PATCH will both error.

---

## 🚧 In flight

- **Phase 3g** — shadow soak diff tooling (the only Phase-3 leg not yet
  shipped; gates the cutover to live sends)
- **C2-D polish** — downstream of C1, generic "make it look as good as
  the athlete page" pass for the rest of the app

---

## 📋 Backlog

### Unification pass (highest pri after Phase 3 closes)
- Align `/dashboard` (coach root), `/dashboard/live`, `/dashboard/captain`,
  `/dashboard/fitness` with the C1 v3 patterns (cards, pills, density
  scale, period toggle)
- Captain dashboard + captain "schedule" page currently feels like a
  redirect to coach dashboard — verify and fix per-page intent
- "Athletes overview" list page → present better than a flat list
- Schedule page (events) → real CRUD UX, not just a read-only grid

### Athlete-side features
- **Manual self-report on the web** (D3 follow-up). Buttons already exist
  on the athlete hero but `self_report` / `log_workout` / `report_injury`
  alert "Coming soon". This is the next functional gap. Include a
  "notes for coach" field on Log workout per the brainstorm.
- Athlete dashboard surface: upcoming events / competitions / start-of-
  season dates pulled from coach-inputted schedule. Model after
  reflect's existing athlete view.
- Show inbound-SMS images: `twilio_messages` may carry a media URL;
  surface those in the timeline if present.

### AI as the centerpiece (Phase 4 — once polish settles)
- AI chat assistant scoped to a player's data
- Push the LLM summary higher in the hero / make it the visual lead
- Coach can ask "who's at risk this week?" and get a ranked answer with
  citations to specific SMS / activity logs

### Coach + admin polish
- "All athletes" view (coach) → tighter card grid, filter by group
- Group rename: coach should be able to edit the group label without
  re-importing the roster CSV
- Admin "users" page — keep it minimal: name, team, role. Drop or
  rename the "Roster link (player)" column to something the admin
  actually understands

### Notifications + alerts
- Activity tab: flag new activity by teammates since last check
- Day-bucketed "leaderboard position changed" alerts (avoid notification
  spam)
- Move the sidebar Requests count to a notification surface so it
  doesn't permanently take real-estate even when 0 (already hides; this
  is the next level — bell icon with combined notifications)

### Future / speculative
- **Whoop integration** — pull readiness from device, cross-check vs
  self-reported survey
- **Geofenced Twilio prompt** — when an athlete lingers at a gym
  location, auto-prompt "log your workout?" via SMS
- **Decommission `reflect`** (Phase 6) — once shadow soak shows parity,
  switch reflect-live to be the live sender and retire the old app

---

## 🐛 Known small issues / followups
- `ActivityLogTimeline` on `/dashboard/live` should filter `hidden=false`
- Data-sync audit: how reflect-live represents inbound data vs reflect
- The summary's "no readiness despite N inbound SMS" case suggests some
  inbound surveys may be miscategorised as `chat` — verify the worker's
  categorizer against actual prod data

---

_Last restructure: 2026-04-30. Previous iterations of this file are in
`git log`._
