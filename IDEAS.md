# Reflect-Live — Ideas & Backlog

<!--
HOW THIS FILE WORKS (read once, then forget):
• You own the Inbox. Dump raw thoughts there anytime — one bullet each.
• Claude only reorganizes this file when you explicitly say "fold the inbox"
  or "update ideas" — never on its own. It will tell you to save first, then
  make surgical edits, so your unsaved typing never gets clobbered.
• Shipped history lives in docs/shipped.md (Claude appends there; you never
  type into it). That keeps this file short enough to scan in one screen.
• Bullets only. If a thought needs paragraphs, it's a spec → put it in docs/.
• Git is the backstop for everything here.
-->

## 🧠 Inbox — dump raw thoughts here
-

## 🔨 Now — actively building (keep to ≤3)
- **Phase 3g** — shadow-soak diff tooling (last Phase-3 leg; gates the live-send cutover)
- **C2-D polish** — bring the rest of the app up to the athlete-page (C1) visual bar

## 📋 Next — backlog

### Multi-org / scaling
- Multi-organization support without data leakage (RLS-hardened)
- Team / organization dashboard
- Coach customization: configurable questions + escalation rules *(low pri)*

### Fitness tracking
- Per-session changeable questions (#pullups, squat wt, clean wt); missed = 0
- Track who has / hasn't been set up on the app
- Swim session inputting → DB sees volume, time cycles, etc.
- Rowing: 2k erg times collection + storage

### Flags & heatmap accuracy
- Fix stale active-flags pipeline (readiness recovered but old flag still showing)
- Relative-density heatmap: scale by report count across date windows (7/14d) without hiding concurrent injuries
- Automatic flagging for concerning responses
- Verify "Open Flags" count (captain view) isn't inflated

### Trainer loop
- Let trainers add player info for individuals
- After an injury, keep nudging the athlete until they (1) see the trainer, (2) recover — re-prompt after each session

### Coach interface
- Sessions page: coach inputs a session directly
- Read emails / files to auto-schedule + better inform the AI assistant
- EoW summary printout for meetings
- Reduce template-pipeline fragility (a template change shouldn't force column-header + graph-legend edits; clarify data continuity across template versions)

### Unification / polish (after Phase 3 closes)
- Align /dashboard, /dashboard/live, /dashboard/captain, /dashboard/fitness to the C1 patterns
- Consistent "return to dashboard" affordance across pages (button vs link mismatch today)
- Events page: add-event as a popup, not a static inline form
- Scheduling + templates pages: less friction, rework the user journey
- "Athletes overview" / "All athletes" → tighter card grid, filter by group
- Schedule page → real CRUD, not read-only
- AI assistant: example prompts say "competition" not "match"

### Media
- Drop `<TwilioMediaStrip>` into the C1 unified timeline + /dashboard/live feed
- Surface inbound-SMS images in the timeline
- Player-uploaded photos (Player view + optional on Log workout: storage bucket + signed URL)
- Events page: coach uploads film / times
- Permanence: Supabase Storage step in the worker (Twilio retains media ~30d)

### AI (Phase 4)
- AI chat assistant scoped to a player's data
- Make the LLM summary the visual lead in the hero
- Coach asks "who's at risk this week?" → ranked answer with citations to specific SMS / activity logs

### Notifications
- Flag new teammate activity since last check
- Day-bucketed "leaderboard position changed" alerts (no spam)
- Bell-icon combined notification surface (retire the always-on Requests count)

### Smaller
- Backdate option on Log workout / Report injury / Self-report (date-time picker defaulting to now)

## 💭 Someday — speculative
- Whoop integration (device readiness cross-checked vs self-report)
- Geofenced Twilio prompt ("log your workout?" when an athlete lingers at a gym)
- Decommission `reflect` (Phase 6) once shadow soak shows parity
- Session replays / HumanBehaviour — talk to Chirag
- Rowing teams in UK colleges (market note from Jack)

## 🐛 Known small issues
- Worker categorizer audit: some inbound surveys may be miscategorised as `chat` (the "no readiness despite N inbound SMS" case)
- Data-sync audit: how reflect-live represents inbound data vs reflect
- Worker type debt: `apps/worker` fails `tsc` (NodeNext extensionless imports + missing `WorkerState`/`SurveyEngine` exports from shared + a couple implicit `any`s). Harmless today — worker deploys via Dockerfile and bun runs the TS directly — but worth a cleanup pass so the worker can be typechecked.
- `apps/worker/nixpacks.toml` is stale: its build step runs `tsc` (which fails) via the broken `bun run --cwd` form. Railway uses the Dockerfile instead. Delete or fix nixpacks.toml to avoid confusion.
