# IDEAS.md Roadmap — UX cleanup + feature work

> **Source:** `IDEAS.md` (raw thoughts, captured 2026-04-29).
> **Goal:** sequence the work so each step ships something visible and the order minimizes rework. Bugs first, page polish second, new features third, AI emphasis last (because polish unlocks the surface AI lives on).

This doc is the roadmap. Each item below is sized to be turned into its own implementation plan when we pick it up.

---

## Bucket A — Bugs (do first)

### A1 — Athlete role view leak  🚨

**Symptom:** Friend logged in as athlete and saw the "admin look at athlete" view. Athletes should *only* see their own dashboard.

**Likely cause:** dashboard-shell's role redirect logic (`role === 'athlete'` branch in `useEffect`) doesn't guard against the case where `prefs.role` was stale or where `prefs.is_platform_admin === true` is leaking through. Could also be `impersonate_player_id` not gated by admin check.

**Plan:**
1. Reproduce on staging — log in as a known-athlete clerk user and compare what `/dashboard` shows vs `/dashboard/athlete`.
2. Audit role redirect in `apps/web/src/components/dashboard-shell.tsx` (lines 116–134).
3. Audit `AppSidebar` props — `isPlatformAdmin`, `hasLinkedAthlete` — confirm they're false for plain athlete users.
4. Tighten the guard: athletes should redirect to `/dashboard/athlete` regardless of any other flag.

**Done when:** athlete login lands on `/dashboard/athlete`, sidebar has no Admin or Players links, no "view as athlete" toggle visible.

---

### A2 — Pages redirecting to dashboard

**Symptom:** "Captain Schedule is the same as Dashboard." "Lots of pages are redirecting to dashboard."

**Likely cause:** either (a) those routes don't exist yet and a catch-all redirect lands them on `/dashboard`, or (b) the role-redirect in dashboard-shell is over-eager.

**Plan:**
1. Inventory: list every sidebar entry per role, click each one, note where it actually lands.
2. For each "lands on /dashboard" hit, decide: build the page, or remove the sidebar entry.

**Done when:** every nav entry either renders a real page or is gone.

---

## Bucket B — Open questions (audit before refactor)

### B1 — What is the `users` page doing? Why "linked athlete"?

**Findings (2026-04-29):**

- The page lives at `/dashboard/admin/users` (not `/dashboard/users`) and is platform-admin-only. It surfaces every Clerk user with a `user_preferences` row and lets admin (a) change `role` and (b) set `impersonate_player_id` (re-labelled to "Roster link (player)").
- `impersonate_player_id` is one column doing **three jobs**: athletes use it to know "which player am I" on `/dashboard/athlete`; coaches/captains who are also on roster use it for the "Also you" sidebar entry; admins use it to view-as-any-athlete.
- Hidden bug discovered during audit: approval set `team_memberships.player_id` but **never** `user_preferences.impersonate_player_id`. A freshly-approved athlete logged in to "Pick an athlete to simulate" — that's why the field felt magical and unintuitive.

**Decision:** keep the page (it's useful as fallback). Fix the bug + relabel + self-heal.

**Shipped:**
1. `dashboard-shell.tsx` — first-creation prefs row now sets `impersonate_player_id = membership.player_id`. Existing rows get healed when membership and prefs disagree (extends A1 self-heal).
2. `POST /api/teams/[id]/requests/[clerkUserId]` (approve branch) — also writes `impersonate_player_id` on the approvee's user_preferences so they land directly on their athlete view.
3. `/dashboard/admin/users` — re-labelled column to "Roster link (player)" and rewrote the intro paragraph to frame the page as a fallback tool, not a routine assignment surface.

---

### B2 — Admin "new athlete / user assignment" journey

**Findings:** the routine path is automatic now — athlete self-requests via `/onboarding`, coach approves via `/dashboard/requests`, both `team_memberships.player_id` and (after this audit) `user_preferences.impersonate_player_id` get written on approval. The admin/users page is the **fallback** for legacy accounts and edge cases.

**Decision:** keep as fallback, no separate journey to build. Folded into B1's writeup.

---

## Bucket C — Page polish (no new features yet)

### C1 — Individual athlete page  ⭐ biggest single UX win

User flagged this as "REALLY work on this." This page sets the visual bar; do it first so the rest of the polish wave inherits its language.

**Targets:**
- Tighten the hero — name, status, period toggle, AI summary card already there; remove dead spacing.
- Make Messages + Activity feel like one timeline, not two separate panels.
- Surface the Body Heatmap more prominently (workout/rehab + injury overlay).
- Mobile/narrow widths.

Brainstorm the design before touching code.

---

### C2 — Athlete overview list → cards/grid

Currently `/dashboard/players` is a flat list. Convert to a grid of athlete cards with name, group, last-on-wire, readiness pill. Click → individual page.

---

### C3 — Dashboard + Live joint redesign  ("kahootz")

User said these need to work together. Currently they overlap heavily (both have a hero stats strip, period toggle, etc.). Decide what's unique to each:
- Dashboard = team-level, slower-moving (trend, next meet, recent activity)
- Live = streaming/right-now (most recent inbound, current readiness, active 24h)

Either page should be "the one I open" depending on intent.

---

### C4 — Schedule page

Currently shows session list. Needs distinct surface for *team events* (meets, practices, lifts) — see C5 / coach event editing.

---

## Bucket D — Net-new features

### D1 — Activity page enrichments
- **MMS photos:** Twilio inbound MMS includes media URLs. Render them inline.
- **"New since last visit" flags:** persist a per-user `last_seen_activity_at`, highlight rows newer than that.
- **Position-change alerts:** day-bucketed so they don't spam (e.g. "Alessia moved up 3 ranks today").
- **Team body heatmap:** sum of all athletes' workout+rehab hits, like reflect's team view.
- **Compactness pass.**

### D2 — Coach event editing on Schedule

Coach posts an event (meet, away game, lifting block) → it shows up on the schedule with date/time + locations. Tied to existing `locations` table or a new `events` table.

### D3 — Athlete view feature parity
- Fitness tab visible to athletes (currently coach-only).
- Athlete sees their *own* body heatmap (workout + rehab + injury overlay).
- Manual self-report form on web (today, only via SMS after a scheduled survey).

### D4 — Whoop integration  *(separate, large)*

OAuth, daily strain/recovery/sleep ingest, blend with readiness scores. Real "AI selling point" depends on this kind of multi-source data. Plan when ready.

---

## Bucket E — AI as the centerpiece

Per IDEAS.md: "AI NEEDS TO BE AT THE FOREFRONT. IT NEEDS TO BE THE SELLING POINT."

Already shipped: per-player AI summary card with caching.

Next:
- **Phase 4 — AI chat** (`/dashboard/chat`) with team + player context (already on the v3 spec).
- **Phase 5 team digest** — captain "EoW summary" button, shareable/printable.
- **Inline AI affordances** — "Why did this athlete drop?" buttons next to charts that pre-fill the chat with that question.

After buckets A–D land, do an AI-emphasis pass: lift summary cards, chat suggestions, and digest buttons into the dashboard so AI is the first thing you see.

---

## Suggested execution order

1. **A1** — fix athlete role leak  ← *security/correctness, must come first*
2. **A2** — sweep redirect bugs  ← *unblocks navigating the app*
3. **B1 + B2** — answer the "users" / "linked athlete" / "admin assignment" questions in one spike
4. **C1** — individual athlete page rebuild  ← *sets the design language*
5. **C2** — athlete overview grid  ← *uses the language*
6. **C3** — dashboard + live joint redesign  ← *pulls it together*
7. **D1** — activity page enrichments
8. **D3** — athlete view feature parity
9. **C4 + D2** — schedule page + coach event editing (paired)
10. **E** — Phase 4 chat + AI-emphasis pass

Whoop (D4) is its own track — pick up after E.

---

## Notes

- Each bucket-item above gets its own spec/plan doc when we start it. Don't try to write detailed plans for everything up front — the design language we settle on in C1 will materially change what C2/C3 should look like.
- Tasks 1-2 (A1, A2) are small enough to do without a separate spec.
- Anything in Bucket C and beyond starts with a brainstorming pass before code.
