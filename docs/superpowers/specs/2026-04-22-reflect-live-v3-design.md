# reflect-live v3 — Design

**Date:** 2026-04-22
**Status:** Pending user approval
**Author:** Ryan Lobo (with Claude Code)
**Supersedes:** `2026-04-21-reflect-live-design.md` (original assignment scope)

---

## 1. Context

reflect-live was built as the MPCS 51238 (Databases) Assignment 4 deliverable — a real-time dashboard that polls the sibling `reflect` FastAPI app's Twilio account. Architecture: Next.js 16 + Supabase (Postgres + Realtime) + Clerk, worker on Railway. Current scope is narrow: inbound message feed, weather for venues, 8 tables, read-only.

The sibling `reflect` app (`/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Winter2026/MPCS51250 Ent in Tech/reflect/`) is a far more complete product: FastAPI + Jinja + SQLite, 11 tables, actual outbound Twilio sends, survey state machine with conditional branching, scheduled sends, WhatsApp reminders, AI chat with 3-provider LLM layer, player/coach/team LLM summaries, SVG injury heatmap with 60+ body regions, reusable question templates, fitness scoring + leaderboard, multi-tenant via `teams.code`. It is running in production at `reflectsalus.app` for 5 teams (UChicago Men's Tennis, Swim, Dive, Track + a test team).

This spec redesigns reflect-live to: (a) look and feel like a proper light-mode product rather than the dark editorial instrument-panel version that misfired; (b) port reflect's complete feature set; (c) eventually replace reflect as the production system via a foolproof shadow-mode cutover.

---

## 2. Design direction — B "Reflect 2.0"

User approved direction B after viewing mockups. The feel:

- Light, warm, friendly — carries reflect's blue + Montserrat heritage
- White cards on a warm off-white ground, not cold gray-on-gray
- Single accent (blue) for actions; green/amber/red only for signal state
- Plain-English names: Dashboard, Athletes, Activity, Schedule, Sessions, Heatmap, AI Assistant, Settings
- No metaphor nav, no station codes, no grain, no editorial italics
- Page header pattern: eyebrow + big sans title + thin meta line. Nothing else.

### 2.1 Tokens

```
--blue:          #1F5FB0     /* primary action */
--blue-2:        #3F7AC4     /* hover */
--blue-soft:     #E8F0F9     /* fill for active nav, pill bg */
--paper:         #FAF8F3     /* page bg */
--paper-2:       #F4F0E6     /* raised secondary */
--card:          #FFFFFF
--ink:           #141923     /* primary text */
--ink-soft:      #475264     /* body */
--ink-mute:      #8D94A2     /* meta / label */
--border:        #EAE5D9
--border-2:      #D7D1C2
--green:         #148759     --green-soft:  #E5F2EC
--amber:         #B9741A     --amber-soft:  #F7ECD4
--red:           #B73B36     --red-soft:    #F6DDDB
--radius:        14px
--radius-sm:     8px
--shadow-sm:     0 1px 2px hsl(28 12% 20% / 0.04)
--shadow:        0 4px 14px hsl(28 12% 20% / 0.06)
```

### 2.2 Typography

- **UI:** Montserrat 400/500/600/700 (matches reflect; friendly, readable)
- **Tabular numerics** (timestamps, stat values): JetBrains Mono, `font-variant-numeric: tabular-nums`
- **Drop entirely:** Fraunces, `h-display`, `h-display-italic`, station-code utility, eyebrow-signal, grain overlay

### 2.3 Layout primitives

- **App shell:** 232px sidebar (white card, faint border), main area (warm ground, 32–48px padding)
- **Page header:** eyebrow (11px uppercase mute) / title (34px bold ink) / meta (13px mute, one line max)
- **Card:** white bg, 1px border, 14px radius, 24px padding. Heavier elements get a 16–18px header row with a border-bottom divider.
- **Stat cell:** label (11.5px uppercase mute) / value (36px bold tabular) / optional sub (12px mute) or trend chip
- **Message row:** time (12px mono) · pill (blue/green/amber) · name (14px 600) + body (13px soft) · optional right-aligned score
- **Pill system:** `.pill-blue .pill-green .pill-amber .pill-red` — filled-soft style, 10.5px bold uppercase with 0.5px tracking

---

## 3. Phase 0 — visual reset

**Goal:** reflect-live looks and reads like the new Reflect 2.0 for every existing page, no new features.

### 3.1 System-level changes

1. `globals.css` — rewrite: delete dark tokens, delete all decorative utilities (`.h-display`, `.h-display-italic`, `.num-display`, `.station-code`, `.eyebrow-signal`, `.live-dot`, `.grain`, `.hairline`, `.pill-signal`, `.pill-heritage`, `.stamp*`, `.slide-in-row`, `.accentStripe`, `.dialSweep`, `.revealUp`). Replace with the token set in §2.1 and the primitives in §2.3.
2. `layout.tsx` — drop Fraunces. Keep Montserrat + JetBrains Mono. Remove the `dark` class from the `<html>` element; the new tokens become the default (light). No light-theme class gymnastics needed.
3. **Delete components** that no longer earn their place: `brand-mark.tsx` (custom SVG monogram), `readiness-dial.tsx` (stopwatch dial), `stamp.tsx`, `section-tag.tsx`, `stat-readout.tsx` (the reflect-live-specific wrapper). Replace with smaller purpose-built primitives in a new `ui/` subfolder.
4. **Add components** under `components/ui/v3/`:
   - `PageHeader` — eyebrow + title + meta + right-side controls
   - `Card`, `CardHeader`, `CardBody`
   - `StatCell` — label + value + optional trend chip
   - `ReadinessBar` — horizontal gauge 0–10 (replaces the circular dial)
   - `Pill` — blue/green/amber/red, soft-filled
   - `MessageRow` — time/pill/name/body/optional score
   - `Brand` — "reflect" wordmark + blue square with "R"

### 3.2 Page-by-page (21 pages)

- **`/` landing** — full rewrite. Masthead (wordmark + sign-in link), hero with headline + subhead + CTAs, the dashboard mock (already in browser-chrome frame — keep), a 6-tile feature grid, CTA band, colophon. Drop Fraunces + all dark tokens.
- **`/sign-in`, `/sign-up`** — single centered form on warm ground, blue primary, no split-pane editorial.
- **`/onboarding`** — single card team picker, blue primary action.
- **`/dashboard`** (coach) — header / hero row (readiness bar card + 3 stats card) / messages card / starred + upcoming-meet lower row / activity log below. Match the B mockup.
- **`/dashboard/players`** → **Athletes** — clean table (name, group, phone, last reply, workouts 30d, rehabs 30d, star, admin delete). Add a primary button "**+ Add athlete**" opening a dialog (addresses IDEAS.md onboarding request).
- **`/dashboard/player/[id]`** → **Profile** — header with name, group, phone, star button. Personal readiness bar + 4 stat cells. Recent messages list. Activity log table. No editorial split, no stamps.
- **`/dashboard/fitness`** → **Activity** — 4 top stats (workouts, rehabs, active loggers, avg per athlete). Upcoming meets row. How-to card (keep, condense). Activity log table with search/filter/select.
- **`/dashboard/events`** → **Schedule** — 4 top stats. Venue weather grid (clean card per venue). Upcoming meets grid with NEXT UP marker. Past meets table. "**+ Add event**" dialog button (IDEAS.md asked for pop-up instead of static form).
- **`/dashboard/athlete`** → **My view** — if not selected, athlete picker grid. If selected: personal readiness bar + 4 stats, messages/activity two-column.
- **`/dashboard/captain`** → captain Dashboard. Same shape as coach dashboard, filtered data, with "Who to follow up with" panel prominent. Fix stale-flag bug (IDEAS.md: ignore flags whose underlying response has been superseded — compute flags against most-recent reading only).
- **`/dashboard/captain/follow-ups`** → **Follow-ups** — ordered list with last-reply time. Quiet-since filter dropdown.
- **`/dashboard/admin`** → **Admin** — 3 count stats + worker health + 4 colored tiles linking to sub-pages (minus borders/grain — lighter shadow on hover).
- **`/dashboard/admin/users`** → **Users** — tabular with clear "Setup status" column (IDEAS.md: track who has/hasn't been set up).
- **`/dashboard/admin/teams`** → **Teams** — table + new-team dialog + edit-team dialog with Twilio credentials section.
- **`/dashboard/admin/system`** → **System** — 4 status stats with colored state, last-polls + errors + backfill sections.
- **`/dashboard/admin/database`** → **Database** — 4 highlight stats + full table counts.
- **`/dashboard/settings`** → **Settings** — role selector (admin only), phone-OTP link, preferences, account, database + worker stats.

### 3.3 Component refits (existing)

- `dashboard-shell.tsx` — rewrite PageHeader per §2.3. Remove `code`, `italic`, `live` props; add `actions`. Shell stays the same otherwise.
- `app-sidebar.tsx` — white surface, blue active state, plain labels, no station codes, no brand-mark SVG. Simple 30px blue square + "reflect".
- `command-palette.tsx` — light-themed, plain labels (matches nav).
- `live-feed.tsx` — simpler rows (time / pill / name / body). Drop the mono-signal LIVE dot inside the panel (page header carries the live indicator).
- `watchlist-panel.tsx` — card with header and athlete rows. Status shown as small `.pill-green / .pill-amber / .pill-mute` ("On wire · 14m" etc.) — not tilted stamps.
- `weather-grid.tsx` — card per venue, clean temp display, no instrument markings.
- `news-feed.tsx` — keep on its own route only (remove from dashboard).
- `activity-log-timeline.tsx` — light table style.
- `worker-health-card.tsx` — stat cell with a colored dot, not the instrument status thing.
- `metric-card.tsx` — now a thin wrapper over `StatCell`.
- `star-button.tsx` — standard pill-style button, blue when starred.

### 3.4 Deliverable for Phase 0

All 21 pages look like Reflect 2.0. No features added. No features removed. Build green. Vercel auto-deploys. User can scroll every page without feeling "cluttered" or "off."

---

## 4. Phase 1 — fitness scoring + leaderboard

Port directly from reflect's scoring config + leaderboard.

**Schema:**
- Add `scoring_config jsonb` to `teams` (points per activity type, e.g. `{"workout": 10, "rehab": 5}`)

**UI:**
- Activity page gains two right-side cards: "This week's leaderboard" and "All-time leaderboard"
- Leaderboard rows: rank · name · group · points · activity count
- Settings → Teams section gains a scoring editor (admin-only)

**Scope:** one page, one table column, two cards, one settings panel. No migrations of existing activity_logs data needed (scoring is computed on demand).

---

## 5. Phase 2 — body heatmap

**Schema:**
- Add `injury_reports` table: `id`, `team_id`, `player_id`, `regions text[]` (e.g. `['ankle_left','knee_bilateral']`), `severity smallint`, `description`, `resolved_at`, `reported_at`
- Add `team.gender` if not present (for painmap image selection)

**Intake:**
- Coach/captain can log an injury report from a player's profile page via a dialog
- Athletes can self-report via a new "Report injury" link in their athlete view
- Parse free-text injury descriptions with a port of reflect's alias map: `left wrist → wrist_left`, `both knees → knee_bilateral`, `tennis elbow → elbow`, `arm → [upper_arm, elbow, forearm]`

**Heatmap:**
- `components/body-heatmap.tsx` — SVG overlay matching reflect's 60+ polygon regions for front/back, male/female
- Aggregates `injury_reports` by region over a time window
- **Density logic (from IDEAS.md):** color ratio = `count_in_region / max_count_across_regions` — so color reflects relative affected areas, not absolute count. Prevents "everything is red" on larger teams.
- Click region → side panel with affected players + injury notes

**Pages:**
- New `/dashboard/heatmap` (coach + captain + admin)
- Embedded mini-heatmap on `/dashboard/player/[id]` (personal view)

---

## 6. Phase 3 — sessions, templates, scheduler (shadow mode)

The biggest phase. Ported directly from reflect.

**Schema additions (5 tables):**
- `sessions` (id, team_id, type check('practice','match','lifting'), label, template_id, video_links_json, metadata_json, deleted_at, created_at)
- `deliveries` (id, session_id, player_id, status check, started_at, completed_at, current_q_idx, reminder_sent_at, UNIQUE(session_id, player_id))
- `responses` (id, session_id, player_id, question_id, answer_raw, answer_num)
- `flags` (id, session_id, player_id, flag_type check, severity check, details)
- `scheduled_sends` (id, session_id, scheduled_at, group_filter, player_ids_jsonb, channel, status, processing_at, cancelled_at, sent_at, error_message)
- `question_templates` (id, team_id, name, session_type, questions_jsonb, is_default)

**Schema extensions:**
- `teams` gains `gender`, `timezone`, `principles_json`, `scoring_json`, `groups_json`, `chart_preferences_json`, `admin_api_key`
- `players` gains `group_tags text[]`, `is_captain boolean`, `password_hash`

**Worker:**
- Reuse the existing Railway worker. Add:
  - `reminder-scheduler` loop: every 1 min, check deliveries + scheduled_sends
  - `twilio-sender` module (mirror reflect's `twilio_client.py`) — but gated behind `TWILIO_OUTBOUND_ENABLED` env var, default false
  - `dry_run_log` table: every would-be send logs `scheduled_at, player_id, channel, body_preview, would_block_reason`
- Shadow soak: run for 1–2 weeks. Daily diff: reflect-live's would-sends vs reflect's actual sends. Zero diffs for 7+ consecutive days.
- Cutover: deploy one env flip — `TWILIO_OUTBOUND_ENABLED=true` in reflect-live + disable reflect's scheduler loop. Rollback = reverse both.

**UI:**
- `/dashboard/sessions` — list view with search, type filter, pagination. Matches reflect's sessions page.
- `/dashboard/sessions/[id]` — detail view with responses table, per-question stats, video links card, rename-column support.
- `/dashboard/schedule` (new, distinct from `/dashboard/events`) — two-column **survey-send scheduler** (athlete pool left, session config right). Support one-off + weekly cadence. `Schedule` (survey sends) and `Events` (meets/competitions calendar) coexist — different concerns, different data.
- `/dashboard/templates` — template editor with drag-drop question reordering, conditional flag UI, captain-only toggle, max-8 questions.

**Question engine:**
- Port `survey_engine.py` to a TypeScript module under `apps/worker/src/survey/`
- Frozen snapshot on first-question: stored in `sessions.metadata_json.question_snapshot` (matches reflect)
- YAML source kept in `packages/shared/survey/survey_v0.yaml` for seed; templates in Postgres override

---

## 7. Phase 4 — AI chat assistant

**Schema additions:**
- `chat_conversations` (id, team_id, user_id, user_role, title, created_at, updated_at)
- `chat_messages` (id, conversation_id, role check, content, context_json, created_at)

**Backend:**
- New API route `app/api/chat/send/route.ts`
- Env: `LLM_PROVIDER` (openai/anthropic/openrouter), `LLM_API_KEY`, `LLM_MODEL`
- Context builder functions (port from `app/chat.py`):
  - `buildTeamSnapshot(team_id, days=14)` → ~500 tokens
  - `buildPlayerContext(player_id, days=30)` → ~700 tokens
  - Auto-detect player names in message, load up to 3 player contexts
- Role-specific system prompts (coach/captain vs player)
- 20-message history window
- Response saved with `context_json` for audit

**UI:**
- `/dashboard/chat` — 280px sidebar (conversation list) + main chat area
- Message bubbles, typing indicator, auto-resize textarea
- Suggestion chips based on role
- Support `?q=...` query param to pre-fill

---

## 8. Phase 5 — LLM summaries

**Schema additions:**
- `llm_cache` (cache_key text primary key, response_jsonb, created_at)

**Backend:**
- `generatePlayerSummary(player_id, days=14)` → JSON `{summary, observations[], recommendations[], citations, confidence}`
- Prompt matches reflect's rules-first template (lead with finding, cite numbers, no hedging, "Insufficient data" fallback <3 sessions)
- Cache key: hash of (player_id, days, data_hash)
- Fallback to rules-based summary if LLM disabled

**UI:**
- Profile page: "Generate summary" button → card with structured output
- Captain dashboard: "Team digest" button → EoW-style printable summary (IDEAS.md ask)

---

## 9. Phase 6 — decommission reflect

After 2 stable weeks with reflect-live owning outbound:

1. Export reflect's `data/sms_logging.db` (final backup)
2. One-time import: any history not already in Supabase migrated over
3. Archive reflect GitHub repo (read-only, keep for reference)
4. Shut down Railway deployment for reflect
5. Remove `reflectsalus.app` DNS or redirect to reflect-live's domain
6. Update docs across both codebases to point to the new canonical

---

## 10. Non-goals (out of scope, explicitly)

- Player self-reporting via web (players still interact via SMS/WhatsApp; web UI is read-only for athletes in Phase 0–5)
- Multi-organization landing/signup (admin manually creates teams via the existing curl flow; can add a proper UI later)
- Session replay / HumanBehaviour integration (IDEAS.md — out of scope)
- Trainer role (new role type — out of scope)
- Video analysis (IDEAS.md — out of scope)
- Rowing-specific features like 2k erg time collection (IDEAS.md — revisit after Phase 5)

---

## 11. Open questions

1. **Domain:** after Phase 6, does reflect-live live at `reflectsalus.app` (inherit) or a new domain? Not blocking Phase 0.
2. **Clerk vs reflect's password_hash auth:** reflect uses its own password hash; reflect-live uses Clerk. For migrated users, do we Clerk-invite them and deprecate passwords, or support both? I recommend Clerk-only; send invite emails during Phase 6.
3. **Admin API key:** reflect has per-team `admin_api_key`. reflect-live uses service-role Supabase key for worker + Clerk for UI. Do we still need per-team API keys? I recommend no — keep the existing Clerk+RLS model.
4. **LLM provider:** default to OpenRouter's free Llama 3.3 70B (matches reflect) or pick a paid Claude/GPT for quality? Recommend: default free, config-switchable.
5. **Phase 3 dry-run diff tool:** build as a script in `scripts/` or as an admin page? Recommend script for soak, admin page optional later.

---

## 12. Non-negotiables

- No app code changes until this spec is approved by the user
- No feature work until Phase 0 visual reset is shipped and reviewed
- No outbound Twilio sends from reflect-live until Phase 3 shadow soak passes zero-diff gate

---

## 13. Approval gate

When the user is satisfied with this spec, next step is to run the `writing-plans` skill on Phase 0 to produce an implementation plan (file-level task list with acceptance criteria). Phases 1–6 get their own spec → plan → implement cycle later.
