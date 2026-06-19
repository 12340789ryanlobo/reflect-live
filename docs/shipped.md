# Reflect-Live — Shipped Log

Human-skim changelog of what's been built. Claude appends here when work
ships (committed + pushed); the live backlog lives in `../IDEAS.md`. Git
history is the authoritative record — this is just a readable summary.

---

## Auth / role boundaries
- Athlete role can no longer see admin/coach surfaces (A1)
- Athlete view leaked from another login — fixed
- Athlete can see their team's fitness/leaderboard tab (peer accountability)
- Captain who's also on the roster gets a personal "My view" → their own
  `/dashboard/players/[id]` page, with self-affordances (Self-report /
  Log workout / Report injury), not the coach affordances
- Athlete settings page no longer shows the coach-only "Default group filter"

## Onboarding / membership
- Join request → coach approval flow with SMS decision notification
- Pending banner + sidebar Requests entry that hides when count is 0 and
  surfaces with a red badge when there's something to triage
- Coach can self-serve a new team; platform admin can configure
  `require_team_approval` globally
- Per-user team switcher in the sidebar header
- **Onboarding form hardened:** email is locked + sourced from Clerk (server
  ignores body.email entirely), phone uses the same `toE164` normalizer the
  OTP + Twilio sender use — live preview ('Will be saved as +1…') and
  red-bordered error if the input can't be normalized. Submit disabled until
  phone is valid.
- **Phone input is now a proper international widget**
  (`react-phone-number-input` + `libphonenumber-js`): country flag selector
  on the left, digit-only field on the right that hard-caps at the country's
  max length. Auto-formats as they type. Output is already E.164.
  `isValidPhoneNumber` validates digit count + national prefix rules. Server
  still runs `toE164` as a backstop for tampered clients.

## Athlete page (C1 — design-language anchor)
- Hero: readiness bar + AI sentence + period toggle + inline action row
- Identity card: name, group, status pill, last-on-wire, phone, **season
  rank** (#3 / 18 with `since YYYY-MM-DD` caption when a season is set)
- Body heatmap with three tabs (**Activity / Injury / Rehab**, Activity is
  the default left-most tab)
- Click a muscle on the heatmap → timeline filters to entries that mention
  that region; "Filtered by:" pill clears it
- Personal counters: workouts / rehabs / surveys / flags
- Click into an athlete → sidebar tab highlights correctly (canonical URL)

## Multiple phones per athlete
- New `player_phones` table — one row per number an athlete owns, exactly one
  `is_primary=true` per player (unique partial index). `players.phone_e164`
  kept as a denormalized cache of the primary so leaderboard/heatmap queries
  don't have to JOIN.
- **Manage phones** dialog from clicking the phone row (visible to coach/admin
  OR the athlete themselves). Add a phone, star one as default, delete
  alternates. Default is always promoted before deleting the current primary.
- Worker inbound matcher reads from `player_phones` so a text from an
  athlete's home-country number lands on their timeline like their US number.
- Approve waterfall queries `player_phones` first (covers international
  students' alts). Falls back to `players.phone_e164` then name-match.
- '+N' chip on the identity card surfaces alternate-phone count.

## Roster management (coach + admin)
- "Edit" pencil on the athlete page header opens a dialog with group dropdown
  (existing groups + "+ New group…") and captain toggle
- Same dialog opens from the group pill on `/dashboard/players` — `+ Add
  group` replaces "—" for athletes with no group
- "Captain" pill next to an athlete's name in the roster table
- Captain promotion writes to `team_memberships.role` and heals the affected
  user's `user_preferences.role` so the change is immediate
- Coaches (was admin-only) can now edit name/group/phone/active/gender;
  delete remains admin-only
- **Manage groups** dialog on the roster page: bulk rename a group (every
  athlete moves) or delete a group (every member ungrouped). Backed by
  `PATCH /api/teams/[id]/groups`.

## Athlete dashboard surface
- **Next competitions** card on `/dashboard/players/[id]`. Up to 3 upcoming
  `locations` rows where `kind='meet'` (kept the data column; user-facing copy
  says "competition" so it generalises past swimming) and `event_date >= now`,
  with days-until + formatted date + Schedule → link. Hides when no upcoming
  events exist (no empty-card noise).
- Coach dashboards + events page also moved to "competition" copy.

## Roster linking fix
- `/api/users` PATCH (admin "linked athlete" tool) now writes to
  `team_memberships.player_id` in addition to
  `user_preferences.impersonate_player_id`. dashboard-shell heals prefs from
  memberships on every load, so writing only to prefs silently reverted the
  link for non-admin users. The membership row is now source of truth.
- `/dashboard/admin/users` is back as a clean read-only **overview** of every
  account. Link-athlete dropdown stripped — that interaction now lives inline
  on the requests inbox. Roles still editable; rest is informational.
- **Approve waterfall** on `/api/teams/[id]/requests/[clerkUserId]` does
  phone-match → name-match (case-insensitive, trimmed, exactly one unlinked
  roster player) → create new. Catches the legacy case where a CSV-seeded
  athlete signs up with a slightly different phone but the same name. Multiple
  matches return 409 with detail so the coach can disambiguate.
- **Requests inbox** surfaces a "Will link to existing roster row …" hint
  inline when the server detected a single unlinked match, and a yellow
  warning when multiple matches exist.

## Manual logging from the web (D3 — complete)
- **Log workout / Log rehab** dialog from the athlete-hero action row. Kind
  toggle, free-form description (heatmap auto-tags regions from the text),
  optional "Notes for coach" surfaced only when logging for themselves. Posts
  to `POST /api/activity-logs` which gates self-vs-other on
  `prefs.impersonate_player_id` and team coach status.
- **Report injury** dialog from the same row. Free-form description + optional
  1-5 severity radio with tone color. Reuses `POST /api/injury-reports`.
- **Self-report** dialog (athletes only). 1-10 readiness picker with tone
  color (1-4 red, 5-6 amber, 7-10 green) + descriptor labels (Cooked / Heavy
  / OK / Solid / Flying), optional notes. Posts to `POST /api/self-report`
  which writes a synthetic `twilio_messages` row with `category='survey'`,
  `direction='inbound'`, body shape `'<n> <notes>'` so the existing readiness
  parser picks it up. Sid prefix `web-self-<uuid>` makes manual self-reports
  identifiable.
- All three dialogs bump a local `dataTick` so the timeline + heatmap +
  readiness bar refresh on save — no hard reload.

## Heatmap + body taxonomy
- One slug ↔ one canonical region rule across the whole map
- bicep / tricep / abs / obliques split out; joints (elbow, wrist, achilles)
  excluded from activity heatmap (real for injury, not "muscles worked")
- Density legend with actual count ranges (0, 1, 2-3, 4-5, etc.)
- Hover tooltip with cursor-following region label

## Coach scoring + season window
- Fitness scoring + leaderboard (Phase 1)
- `team.competition_start_date` + coach-editable "Season start" in
  `/dashboard/settings` — drives season-rank window; null = all-time

## LLM summaries (Phase 5)
- `llm_cache` table with input-hash + 24h throttle keys
- Summary ingests **activity_logs, injury_reports, twilio_messages** on top of
  session responses + flags (the team's actual data flow)
- Hero renders `summary` + collapsible `observations` (•) + `recommendations`
  (→) + LLM/Rules pill + confidence pill; "View analysis" collapsed by default
- Prompt rewrites recent-half vs earlier-half comparisons + samples raw
  inbound SMS bodies when no readiness number was parseable

## Sessions / scheduler shadow mode (Phase 3, partial)
- Schema migration, ts port of survey_engine, sessions list/detail UI,
  templates editor, schedule UI, worker reminder scheduler + dry-run twilio
  sender. Shadow soak diff tooling still pending (tracked as Phase 3g in IDEAS).

## Inbound media — end-to-end
- Migration 0023 adds `media_sids text[]` to `twilio_messages` and
  `activity_logs`. Worker pulls Twilio media SIDs per message (extra API call
  when `numMedia > 0`) and stores them; copies onto activity_logs when
  category is workout/rehab.
- Proxy endpoint `/api/twilio-media/[messageSid]/[mediaSid]` auths with the
  team's twilio creds (or env fallback) and streams the image bytes back;
  browser caches each image 24h.
- `<TwilioMediaStrip>` renders 3 inline 36px thumbnails with `+N` overflow
  chip; click opens a lightbox modal with prev/next + a current/total counter.
- Wired into `/dashboard/fitness` past-activity table.
- **Historical media backfill — done 2026-05-01.** 4947 inbound messages
  scanned, 473 had photos, 293 mirrored onto activity_logs. 0 failures.
  (First pass paginated wrong — offset-based + mutating filter set skipped
  rows; fixed to `.limit(PAGE)` from-the-top.)

## Per-question score-trends card (2026-05-01)
- Athlete page groups bare-numeric survey replies by their paired question
  (strips '[Session - Date]' prefix + 'Hey {name}!' lead-in to merge sends),
  renders one mini SVG chart per question (red/amber/green dots, dashed
  midline at 5, last-score callout, avg label). Reminder-nudge SMS now
  noise-filtered + excluded from question detection so a 'Reply to continue'
  nudge doesn't pair as a Q with a later answer.

## Recoverable entry delete (2026-06-18)
- Deleting a timeline entry on the athlete page now propagates everywhere
  without a refresh. `onDelete` bumps `dataTick`, and the Competitions
  standing card, season-rank, and last-inbound effects (which previously
  fetched once and never re-ran) now react to it. Fixes deleted entries
  lingering in competition standings until a hard reload.
- **Undo:** the blocking `confirm()` ('you can't undo this') is replaced by
  an optimistic delete + 8s 'Entry deleted · Undo' toast (`sonner`). Undo
  flips the row back via new restore endpoints. Failed deletes revert the
  optimistic removal and surface `toast.error`.
- **Trash:** a collapsed 'Recently deleted (n)' card below the timeline
  lists soft-deleted activity logs + self-report sessions (per-athlete) with
  a Restore button. New endpoints: `GET /api/{activity-logs,self-report}/trash`
  and `POST .../{id|sessionId}/restore` — restore mirrors the delete cascade
  exactly (self-report un-hides the whole session + any mirrored activity_logs
  via `source_sid`), with auth at parity with the delete handlers.
- No migration — reuses the existing `hidden` columns (0010, 0034). The
  separate `sessions.deleted_at`/`deliveries` deletion path was left untouched.
