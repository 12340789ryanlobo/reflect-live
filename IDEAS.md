# Reflect-Live Ideas + Backlog

> **Working contract for Claude:** read this file at the start of every
> task, and update it after every shipped change. Move new ideas out of
> the Inbox into the right backlog section as part of each update. Mark
> things as ✅ Shipped only after they're committed and pushed.

---

## 🧠 Inbox — drop raw thoughts here

> Write anything here as it comes to you — half-formed ideas, bugs you
> spotted, questions, "wouldn't it be nice if…". Claude will fold each
> entry into the structured sections below on the next update and clear
> it from this list. Leave a `-` bullet per thought.

- 
- 
- 
- 
- 
- 
- 
- 
- 
- 
- 
- 
- 
- 

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

### Roster management (coach + admin)
- "Edit" pencil button on the athlete page header opens a dialog with
  group dropdown (existing groups + "+ New group…") and captain toggle
- Same dialog opens when clicking the group pill on `/dashboard/players`
  — `+ Add group` affordance replaces "—" for athletes with no group
- "Captain" pill renders next to an athlete's name in the roster table
  for quick visual scan of who runs what
- Captain promotion writes to `team_memberships.role` and heals the
  affected user's `user_preferences.role` so the change is immediate
- Coaches (was admin-only) can now edit name/group/phone/active/gender;
  delete remains admin-only
- **Manage groups** dialog on the roster page: bulk rename a group
  (every athlete moves) or delete a group (every member ungrouped).
  Backed by `PATCH /api/teams/[id]/groups`.

### Athlete dashboard surface
- **Next competitions** card on `/dashboard/players/[id]`. Shows up to
  3 upcoming `locations` rows where `kind='meet'` (kept the data
  column; the user-facing copy says "competition" so it generalises
  past swimming) and `event_date >= now`, with days-until + formatted
  date + a Schedule → link. Component is reusable and hides when no
  upcoming events exist (no empty card noise).
- Coach dashboards + events page also moved to "competition" copy.

### Roster linking fix
- `/api/users` PATCH (admin "linked athlete" tool) now writes to
  `team_memberships.player_id` in addition to
  `user_preferences.impersonate_player_id`. dashboard-shell heals
  prefs from memberships on every load, so writing only to prefs
  silently reverted the link for non-admin users. The membership row
  is now the source of truth.
- `/dashboard/admin/users` is back in sidebar / admin landing tile /
  command palette as a clean read-only **overview** of every account.
  The link-athlete dropdown was stripped — that interaction now lives
  inline on the requests inbox. Roles still editable; everything else
  is informational. Linked athlete is shown as plain text or
  '— unlinked —'.
- **Approve waterfall** on `/api/teams/[id]/requests/[clerkUserId]`
  now does phone-match → name-match (case-insensitive, trimmed,
  exactly one unlinked roster player) → create new. Catches the
  legacy case where a CSV-seeded athlete signs up with a slightly
  different phone but the same name. Multiple matches return 409
  with a helpful detail so the coach can disambiguate via the
  hidden /dashboard/admin/users tool.
- **Requests inbox** surfaces a "Will link to existing roster row …"
  hint inline on each request when the server detected a single
  unlinked match, and a yellow warning when multiple matches exist
  (so the coach knows approve will fail before clicking).

### Manual logging from the web (D3 — complete)
- **Log workout / Log rehab** dialog from the athlete-hero action row.
  Kind toggle, free-form description (heatmap auto-tags regions from
  the text), optional "Notes for coach" field surfaced only when the
  athlete is logging for themselves. Posts to a new
  `POST /api/activity-logs` endpoint that gates self-vs-other on
  `prefs.impersonate_player_id` and team coach status.
- **Report injury** dialog from the same action row. Free-form
  description + optional 1-5 severity radio with tone color. Reuses the
  existing `POST /api/injury-reports`.
- **Self-report** dialog (athletes only). 1-10 readiness picker with
  tone color (1-4 red, 5-6 amber, 7-10 green) + descriptor labels
  (Cooked / Heavy / OK / Solid / Flying), optional notes. Posts to a
  new `POST /api/self-report` that writes a synthetic
  `twilio_messages` row with `category='survey'`, `direction='inbound'`,
  body shape `'<n> <notes>'` so the existing readiness parser picks it
  up automatically. Sid prefix `web-self-<uuid>` makes manual
  self-reports identifiable in the data.
- All three dialogs bump a local `dataTick` so the page's timeline +
  heatmap + readiness bar refresh on save — no hard reload.

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
- Show inbound-SMS images: `twilio_messages` may carry a media URL;
  surface those in the timeline if present.
- Optional photo upload on Log workout (storage bucket + signed URL).
- Backdate option on Log workout / Report injury / Self-report
  (date+time picker defaulting to now; useful for "logged it the next
  morning"). Today the synthetic survey row uses `now()` for
  `date_sent`, so backfilling a missed check-in isn't possible.

### AI as the centerpiece (Phase 4 — once polish settles)
- AI chat assistant scoped to a player's data
- Push the LLM summary higher in the hero / make it the visual lead
- Coach can ask "who's at risk this week?" and get a ranked answer with
  citations to specific SMS / activity logs

### Coach + admin polish
- "All athletes" view (coach) → tighter card grid, filter by group

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
- Data-sync audit: how reflect-live represents inbound data vs reflect
- The summary's "no readiness despite N inbound SMS" case suggests some
  inbound surveys may be miscategorised as `chat` — verify the worker's
  categorizer against actual prod data

---

_Updated 2026-04-30: /dashboard/admin/users is back in the nav as a
clean read-only platform overview (every account, role, linked
athlete, joined-on). Stripped the link-athlete dropdown — that
interaction is now inline on the requests inbox where the auto-match
hint surfaces it before the coach clicks Approve. Role editor still
works for the rare promote/demote case._
