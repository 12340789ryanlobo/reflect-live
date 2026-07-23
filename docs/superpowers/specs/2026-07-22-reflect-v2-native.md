# Reflect v2 — Native-First Rebuild

**Date:** 2026-07-22
**Status:** Approved (locked decisions session 2026-07-22)

---

## 1. Context — the v2 pivot

The SwiftUI app at `apps/native/Reflect` becomes the primary product. Athletes report workouts and check-ins in-app; SMS via Twilio is dropped as an athlete-facing channel. The web app is frozen at the Phase 1 identity cutover and will be remodeled after the native design in Phase 6.

The pivot collapses the Worker-as-source-of-truth model for athlete data. The worker retains weather and survey scheduling; everything else lives in the native client and Supabase RLS.

Auth moves from Clerk to Supabase Auth (Sign in with Apple + email OTP). RLS keys off `auth.uid()` rather than a Clerk JWT claim. Both iOS and macOS targets are kept building at every phase.

---

## 2. Product positioning

- **Ambition:** a real product, sold to teams beyond UChicago. Niche: swimming & diving first, then big-roster endurance sports (track/XC/rowing).
- **One-liner:** "Your team competes to stay accountable — you see who's ready." Athlete accountability game is the hero; coach readiness pulse is the monetized byproduct. Role determines the shell, so each persona sees one product.
- **Persona goals** (every screen answers to these):

| Persona | Goal | Success metric |
|---|---|---|
| Athlete | Log the work, see it counted, see where they stand | Logs/athlete/week |
| Captain | Keep the roster engaged without nagging; competitions run themselves | % roster active weekly |
| Coach | 60-second morning scan — who's ready, who's fading, who's hurting; zero data entry | Check-in completion + flags reviewed |

- **Dependency rule:** the coach's product is manufactured by the athlete's product. In polish trade-offs, the athlete loop wins.
- **Adoption motion:** open self-serve team creation. Onboarding forks once: "Join a team" (code or invite deep link; link joins auto-approve) or "Start a team" (name + sport → creator becomes manager instantly, no platform approval). Schema role stays `coach`, displayed as "Manager" in the UI. Teams are free until billing returns in Phase 6.

---

## 3. Locked decisions (D1–D9)

| # | Decision |
|---|---|
| D1 | **Identity column rename.** `clerk_user_id` → `user_id` (stays `text`) on `user_preferences` and `team_memberships`. Every RLS expression becomes `user_id = (select auth.uid())::text` — a mechanical sweep, no semantic change. No uuid FK to `auth.users`. |
| D2 | **Existing account migration.** Ryan relinks via one manual `UPDATE` after his first Apple sign-in. All other users re-onboard; athlete history is preserved because `activity_logs` is keyed on `player_id`, not the auth identity. Orphaned `user_2…` Clerk rows are deleted in Phase 4 cleanup. |
| D3 | **Web frozen at Phase 1.** The web app gets a freeze banner at the identity cutover and migrates to Supabase Auth (`@supabase/ssr`) in Phase 6 when it is remodeled anyway. |
| D4 | **Auth methods.** Sign in with Apple (primary) + email OTP fallback. SIWA requires the paid Apple Developer Program — OTP keeps every phase shippable without it. |
| D5 | **Flags computed server-side.** A Postgres `after insert on responses` trigger (`security definer`) writes flags; clients can never insert directly. An athlete must not be able to suppress their own injury flag. |
| D6 | **RLS helpers in `private` schema.** `security definer` functions (`private.uid()`, `my_team_ids()`, `my_role(tid)`, `my_player_id(tid)`) prevent the `team_memberships` self-reference recursion that forced policy drops in migration 0017. |
| D7 | **Twilio poll loop kept through Phase 3.** Deleted in Phase 4. |
| D8 | **`dry_run_log` wound down.** Writes stop in Phase 2; table dropped in Phase 4. Its SMS shadow-soak purpose is gone once in-app delivery is live. |
| D9 | **Survey delivery via materialized rows.** The worker materializes `deliveries` at send time (engine unchanged). The client learns of new deliveries via Realtime (already in the publication) and foreground refetch. APNs is an additive, flagged layer (`APNS_ENABLED`) — nothing hard-depends on it. |

---

## 4. Native app architecture + screen map

### Stack

SwiftUI, `@Observable` models (one per feature screen, owned via `@State`), async/await throughout, supabase-swift v2 (auth / postgrest / realtime / storage), Nuke for image caching, PhoneNumberKit. Clerk SPM dependency removed. `PostgresDate` and its decoder carry over from the skeleton verbatim. `SupabaseService` drops the Clerk `accessToken` closure — native Supabase auth handles Keychain persistence, token refresh, and Realtime `setAuth` automatically.

### Layout under `apps/native/Reflect/Reflect/`

```
ReflectApp.swift                — injects SessionController
App/    AppConfig, RootView (auth/onboarding/role switchboard),
        AppShell (TabView iOS / NavigationSplitView macOS),
        SessionController (auth state stream → memberships, role, teamId, playerId)
Core/   Supabase/{SupabaseService, PostgresDate, LoadState},
        Realtime/RealtimeHub (AsyncStream per table+filter; subscriptions live in .task{}),
        Models/…, Scoring/Leaderboard (port of web lib/scoring.ts),
        Survey/SurveyFlow (port of packages/shared/src/survey/{flow,validate}.ts)
Features/ Onboarding, Athlete/Today, Athlete/Log, Surveys, Leaderboard,
          Coach/{Roster,Sessions,Pulse}
Shared/UI/{ErrorBanner, AsyncButton, …}
```

Models expose `LoadState<T>` + `load()/refresh()`. Realtime events are an invalidation signal that triggers a refetch — matching the web pattern — rather than patching in-memory state. There is no offline queue in v1. Swift Testing pins the TypeScript ports (`Leaderboard`, `SurveyFlow`, `PostgresDate`) against the corresponding `scoring-competition.test.ts` cases.

### Screen map

**Athlete tabs**

| Tab | Content |
|---|---|
| Today | Survey inbox, week points + rank, quick log entry |
| Log | Composer (kind drawn from competition scoring keys ∪ {workout, rehab}, description, date, photo); own timeline with soft-delete swipe |
| Leaderboard | Team standings |
| Profile | Settings, sign out |

**Coach tabs** (displayed as "Manager")

| Tab | Phase | Content |
|---|---|---|
| Pulse | P2 | Readiness overview |
| Sessions | P2 | Live deliveries grid, responses, flags, send-survey action |
| Roster | P1/P2 | P1: approve requests + link players; P2: player detail |
| Leaderboard | P1 | Team standings |

**Onboarding**

Sign In → fork: **Join a team** (code or invite deep link; link joins auto-approve via `join_team_by_code` RPC) or **Start a team** (name + sport → `create_team_with_manager` RPC, creator becomes coach-role active member instantly) → PendingApproval view only for cold code joins (Realtime on own membership row).

**Cut from v1:** news, weather, injury heatmap, events, billing, platform admin, captain-specific views, templates editor, watchlist. Captain = athlete in v1 UI; gains competition admin in Phase 3.

---

## 5. Auth migration approach

Supabase Auth replaces Clerk in Phase 1 for native. The web app is frozen; it migrates in Phase 6.

Migration 0036 renames `clerk_user_id` → `user_id` across `user_preferences` and `team_memberships` and rewrites every dependent RLS policy to use `user_id = (select auth.uid())::text`. The `private` schema is created at the same time with its `security definer` helper functions so all new policies are recursion-safe from the start.

After their first native sign-in, Ryan runs a single manual `UPDATE user_preferences SET user_id = '<new_uid>' WHERE user_id = '<old_clerk_id>'`. All other users re-onboard through the normal join flow; their `activity_logs` history reconnects when the coach approves and links the new membership to the existing `players` row.

Sign in with Apple requires the paid Apple Developer Program (same gating as APNs). Email OTP is a co-equal auth path so every phase ships regardless of whether the paid account is active.

---

## 6. RLS write-policy model

Full SQL lives in migrations 0036 and 0037. The policy model in summary:

- **`players`** — coach can insert and update; no delete (deactivate via `active = false`).
- **`team_memberships`** — athletes may self-insert only as `(status='requested', role='athlete', player_id null)`; self-update is limited to `requested`/`left`; coach controls status, role, player_id, and decided_* fields.
- **`activity_logs`** — athletes may insert only their own `player_id` on their own team with `source_sid null`; coaches may insert for any player. Updates are restricted via column-level grants (`kind`, `description`, `logged_at`, `hidden`, `image_path`). No DELETE: `hidden = true` is the only removal path.
- **RPCs (security definer):** `join_team_by_code` — team codes are non-enumerable (0035 revoked broad `teams` select); invite-link joins create the membership as `active` and auto-link a `players` row; cold code joins as `requested`. `create_team_with_manager` — inserts a `teams` row with a generated `team_code` and a `coach`-role active membership for `auth.uid()`. Self-serve, no platform approval required.

All new policies use `private.*` helper functions (D6). Column-level grants are role-wide; row policies handle the athlete/coach separation.

---

## 7. Survey delivery over push

The survey engine (sessions → deliveries → responses → flags) is unchanged. What changes is the notification channel.

The worker materializes `deliveries` rows at scheduled send time exactly as before. The client learns via a Realtime subscription on `deliveries` (already in the publication) combined with a foreground refetch — no polling. The athlete answers questions through a native stepper (Swift port of `packages/shared/src/survey/{flow,validate}.ts`).

For reminders, the worker's reminder loop retains `reminder_sent_at` idempotency and sends a push notification or does nothing, depending on `APNS_ENABLED`. APNs is token-based (`.p8` key), implemented behind the flag in Phase 4.

Flags are written by a Postgres `after insert on responses` trigger (`private.evaluate_flag()`), which parses the snapshot `flag_rule` conditions against `answer_num`. No client can write to `flags` directly.

The `scheduled_sends.channel` CHECK constraint is extended in migration 0038 to include `'in_app'` as a valid value (default `in_app`). An `in_app` channel entry causes the worker to do nothing for the send itself — the delivery row is the notification.

---

## 8. Phase table

| Phase | Ships |
|---|---|
| 1 | Supabase Auth (SIWA + OTP); onboarding/join/start-team; athlete text log + timeline + leaderboard; coach roster + request approval; Clerk removed from native; both platforms build. Migrations 0036 + 0037. |
| 2 | Surveys in-app: athlete inbox + stepper (SurveyFlow port), coach Sessions live detail + send; Today tab; worker `in_app` dispatch path; stop writing `dry_run_log`. Migration 0038. |
| 3 | Photos (Storage + Nuke, `.fileImporter` on macOS); edit-own-log; coach Pulse; injury quick-report; competition admin for coach and captain. Migration 0040. |
| 4 | Push-ready: `device_tokens`, PushRegistrar, flagged APNs sender; retire Twilio poll loop, SMS survey paths, `dry_run_log` table, orphaned Clerk `user_2…` rows. Migrations 0041 + 0042. |
| 5 | Coach depth: templates editor, player detail, watchlist; athlete streaks + rank-movement polish. |
| 6 | Web migrated to Supabase Auth (`@supabase/ssr`); web remodeled after native design. Migration 0043 (competitions coach write policies). |

---

## 9. What dies

| Item | Gone |
|---|---|
| Clerk (native) | Phase 1 |
| Twilio athlete flows — new sends | New sends stop Phase 2 (channel = in_app); code deleted Phase 4 |
| Twilio poll loop | Phase 4 |
| `dry_run_log` | Writes stop Phase 2; table dropped Phase 4 |
| Synthetic `api/self-report` Twilio rows | Phase 1/2 |
| `twilio_messages` as active channel | Becomes read-only history after Phase 4 |
| Clerk (web) | Phase 6 |

---

## 10. Risks

1. **SIWA requires the paid Apple Developer Program.** Email OTP is the co-equal fallback; Phase 1 ships without the paid account. macOS SIWA is additionally flaky on unsigned dev builds — OTP covers both cases.

2. **TypeScript → Swift port drift.** `SurveyFlow` and `Leaderboard` are ported manually. Mitigated by mirrored unit tests in Swift Testing pinned against `scoring-competition.test.ts` cases.

3. **`team_memberships` RLS recursion.** Any new policy touching `team_memberships` must use the `private.*` definer helpers. Direct references to the table inside its own policies trigger the recursion bug fixed in 0017. The helper functions exist precisely to prevent this.

4. **Coach approval is a two-write client sequence.** Approving a request requires updating the membership row and optionally creating/linking a `players` row — not atomic. A `approve_membership` security definer RPC is noted as a fallback if non-atomicity causes visible inconsistency in practice.

5. **Column-level grants are role-wide.** `GRANT UPDATE (kind, description, …) ON activity_logs` applies to all `authenticated` users; the row policy provides the actual per-athlete/per-coach separation. Any migration that adds a column to `activity_logs` must evaluate whether the grant list needs updating.
