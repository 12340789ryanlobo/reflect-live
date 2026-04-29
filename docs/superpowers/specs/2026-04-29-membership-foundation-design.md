# Membership Foundation — Design Spec

**Date:** 2026-04-29
**Sub-project:** 1 of 5 in the multi-team product reframe
**Status:** Approved (brainstorm complete)

---

## 1. Goal

Turn reflect-live into a real multi-team product. Today the schema is multi-tenant (every row has a `team_id`) but the user-facing flows assume one pre-seeded team. This sub-project lets coaches create teams, athletes find and request to join them, and approvers (coach + captain) accept members. The men's/women's swim split that motivated this becomes a special case of the general flow.

A coach signs up, creates an empty team, gets a team code and a "Pending requests" inbox. An athlete signs up, OTP-verifies their phone, and lands on either an auto-joined team (phone matches an existing roster entry) or a "Find a team" picker (typical case for new teams) where they browse or paste a code and submit a request. The coach approves or denies. SMS notifies the athlete; the page flips via realtime when the decision lands.

## 2. Non-goals (deferred to future sub-projects)

- **Sub-2** — Multi-team team switcher UI. The schema supports it from day one (a user can hold multiple memberships); polished switcher UX ships next.
- **Sub-3** — WhatsApp opt-in seamless flow. Post-acceptance nudge with `wa.me` deeplink + auto-detect on first inbound message.
- **Sub-4** — Coach invite path. Coach pre-invites athlete by name+phone, athlete claims via SMS link.
- **Sub-5** — Bulk roster CSV upload for migrating established teams.

This spec includes the data shapes those sub-projects will need (e.g. `status='invited'` on memberships) so the schema doesn't churn between phases. The user-facing surfaces ship in their own cycles.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                       Clerk                              │
│            (auth — issues JWT to web app)                │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│                   Next.js (Vercel)                       │
│  /onboard         athlete: phone OTP, find team          │
│  /dashboard/...   coach: pending requests, team creation │
│  /api/team-memberships/*  approve/deny/leave             │
│  /api/teams/*     create, list, freeze                   │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│                Supabase (Postgres + RLS)                 │
│   team_memberships   ← single source of truth            │
│   teams              ← + creation_status, approval flag  │
│   user_preferences   ← + is_platform_admin               │
│   players            ← role rows linked via membership   │
│   Realtime ON: team_memberships                          │
└──────────────────────────────────────────────────────────┘
                            ▲
                            │
┌──────────────────────────────────────────────────────────┐
│             Worker (Railway, existing)                   │
│   On membership decision → Twilio SMS to athlete         │
│   (uses existing scheduled_sends pipeline; gated by      │
│    TWILIO_OUTBOUND_ENABLED — until then, dry_run_log)    │
└──────────────────────────────────────────────────────────┘
```

The worker doesn't get new poll loops in this sub-project. Decision-driven SMS reuses the existing `scheduled_sends` + `dry_run_log` pipeline by inserting a one-off send row when a coach approves/denies.

## 4. Schema

### 4.1 New table — `team_memberships`

```sql
create table team_memberships (
  clerk_user_id   text       not null,
  team_id         bigint     not null references teams(id),
  player_id       bigint     references players(id) on delete set null,
  role            text       not null default 'athlete'
                  check (role in ('athlete','captain','coach')),
  status          text       not null
                  check (status in (
                    'requested',  -- athlete asked to join, awaiting decision
                    'invited',    -- (sub-4) coach pre-invited, awaiting claim
                    'active',     -- confirmed both ways, full member
                    'denied',     -- coach declined the request (audit trail)
                    'left',       -- athlete voluntarily left or withdrew request
                    'removed'     -- coach removed athlete from team
                  )),
  default_team    boolean    not null default false,
  requested_name  text,         -- name supplied on the request form
  requested_email text,         -- email supplied on the request form
  requested_at    timestamptz  default now(),
  decided_at      timestamptz,
  decided_by      text,         -- clerk_user_id of approver
  deny_reason     text,
  primary key (clerk_user_id, team_id)
);

create unique index uq_one_default_per_user
  on team_memberships(clerk_user_id) where default_team;

create index idx_memberships_team_pending
  on team_memberships(team_id, requested_at desc) where status = 'requested';

create index idx_memberships_user_active
  on team_memberships(clerk_user_id) where status = 'active';
```

One row per (user, team). `status` distinguishes requests, active members, departures. `player_id` is null while status is `requested`; populated on approval. `role` is per-team — a user can be a coach on team A and an athlete on team B.

### 4.2 `teams` extension

```sql
alter table teams add column if not exists
  creation_status text not null default 'active'
  check (creation_status in ('pending','active','suspended'));

alter table teams add column if not exists
  team_code text unique;          -- shareable code for self-request flow

alter table teams add column if not exists
  activity_visibility text not null default 'public'
  check (activity_visibility in ('public','coaches_only'));

-- Global flag, owned by platform admin (you):
create table if not exists platform_settings (
  id int primary key default 1 check (id = 1),
  require_team_approval boolean not null default false
);
insert into platform_settings (id) values (1) on conflict do nothing;
```

`team_code` defaults to a generated short string at insert time (handled in the create-team route, not via DB default).

### 4.3 `user_preferences` extension

```sql
alter table user_preferences add column if not exists
  is_platform_admin boolean not null default false;
```

`user_preferences.team_id` becomes a derived "current view" rather than authoritative. Reads still hit it; writes flow through `team_memberships`. A small adapter in the API normalizes which team the user is currently looking at vs. which they have memberships on.

### 4.4 RLS

`team_memberships` reads:
- A user can read their own rows (any status) — they need to see pending requests on their dashboard.
- A user can read all rows on a team where they have an active membership with role in (`coach`, `captain`) — to see incoming requests and the roster.
- Platform admin can read all.

Writes go through service-role API endpoints, not RLS.

### 4.5 Migration of existing data

One-shot migration in `0015_membership_foundation.sql`:
1. Create the new tables/columns above.
2. For each existing `user_preferences` row with `team_id`, insert a `team_memberships` row at `status='active'`, `role` mapped from `user_preferences.role` (`admin` → `coach` for the team-level role; cross-team admin powers come from `is_platform_admin`), `default_team=true`, `decided_at=now()`, `decided_by` left null (audit caveat — these were grandfathered).
3. Set `is_platform_admin=true` on the `user_preferences` row(s) where `role='admin'` so existing platform admins keep their cross-team powers.
4. Wire each existing player to the corresponding membership where the user has `impersonate_player_id` set.
5. Set `team_code` for every existing team. The current swim team gets a hard-coded literal in the migration (e.g. `'uchicago-swim'`) so coaches can keep using a known short string.

`user_preferences.team_id` stays in place for backward compat as the user's "currently viewing" pointer. Authoritative membership flows through `team_memberships`. Future sub-2 work removes the redundant column once the team switcher routes through memberships.

## 5. Athlete onboarding flow

```
Sign up via Clerk (email, OAuth, etc.)
         │
         ▼
"Verify your phone" — existing OTP flow
         │
         ▼
Phone verified
         │
         ▼
SELECT * FROM players WHERE phone_e164 = ?
         │
   ┌─────┼─────┐
   │     │     │
 0 rows  1 row  N rows
   │     │     │
   │     │     ▼
   │     │   Auto-create memberships for all matching teams,
   │     │   default_team = first alphabetically.
   │     │   Status = 'active'. Show team switcher highlight.
   │     │
   │     ▼
   │   Auto-create membership for that team,
   │   status = 'active', default_team = true.
   │   Land on dashboard.
   │
   ▼
"Find a team" UI:
  - Browsable list (teams where creation_status='active')
  - Or paste a team code
         │
         ▼
Submit request: name, email pre-filled from Clerk profile
         │
         ▼
Insert team_memberships row:
  status = 'requested'
  player_id = null
  requested_name, requested_email, requested_at filled
         │
         ▼
Athlete sees the dashboard with a banner:
  "Request to [Team] is pending — [Cancel request]"
  Banner subscribes to the membership row via Supabase realtime.
```

### 5.1 Banner / pending state

While `status='requested'`:
- Persistent banner at the top of every dashboard page.
- Other team data is empty (RLS blocks it; no membership = no read).
- Settings, profile, and the request banner remain accessible.
- Cancel button → `PATCH /api/team-memberships/:id` with `{ status: 'left' }`. Athlete can re-request later.

### 5.2 On decision (realtime)

The membership row is in the realtime publication. The browser subscribes to its own user's row.
- `status` flips to `active` → page auto-redirects to dashboard.
- `status` flips to `denied` → banner morphs to "Request was declined. [Reason if any]. [Try another team]."

### 5.3 SMS notification

When the coach decides, the API inserts a one-off `scheduled_sends` row pointed at the athlete's phone with the body:
- approve: `"You're in! [Team] is ready when you are. Open the app: <link>"`
- deny: `"Your request to [Team] was declined. <reason if provided>"`

The worker scheduler picks it up on its next poll. While `TWILIO_OUTBOUND_ENABLED=false`, this lands in `dry_run_log`. Once enabled, real SMS goes out. The realtime path is independent of SMS — coaches can rely on either channel.

## 6. Coach UI

### 6.1 Team creation

`/dashboard/team/new` — visible to any signed-in user without a coach role on any team (or under a "Create another team" link in settings).

Form:
- Name (required)
- Code (auto-suggested from name, e.g. "uchicago-mens-swim"; editable; must be unique)
- Default gender (male / female / mixed)
- Optional: timezone, principles_json placeholder

Submit:
- If `platform_settings.require_team_approval = false` (default): `creation_status='active'`, team is live. Redirect to the new team's dashboard.
- If `require_team_approval = true`: `creation_status='pending'`. Athlete-facing browse list excludes pending teams. Creator sees "Awaiting platform admin approval" state until decided.

The team creator gets a `team_memberships` row at `role='coach'`, `status='active'`, `default_team=true`.

### 6.2 Pending requests inbox

New sidebar entry: **"Requests"** with a count badge for `status='requested'` rows on this team. Visible to roles `coach` and `captain`.

Page lists each request:
- Requester name + email + phone
- `requested_at` relative time
- Approve / Deny buttons (Deny opens a small dialog with optional reason field)

Approve action (`PATCH /api/team-memberships/:id`):
1. Insert a fresh `players` row for the athlete (`name`, `phone_e164`, `team_id`, `active=true`).
2. Update membership: `status='active'`, `player_id=<new>`, `decided_at=now()`, `decided_by=<approver clerk_user_id>`.
3. Insert decision SMS into `scheduled_sends`.
4. Realtime fires → athlete page flips.

Deny action: same but `status='denied'`, no player created, optional `deny_reason` saved, decision SMS still goes out. Audit row sticks around.

Captains can approve/deny only. Coaches can approve/deny + invite/remove (sub-4) + change roles. Coaches/admins also see Promote/Demote on the roster page.

### 6.3 Team settings additions

- Visible team code (copyable).
- Activity visibility toggle (`public` / `coaches_only`).
- Future: edit name, default_gender, etc.

## 7. Admin UI

### 7.1 All teams panel

`/dashboard/admin/teams` — platform-admin only (`is_platform_admin=true`).

Table of every team in the system:
- Name, code, member count, status (`active`/`pending`/`suspended`), created_at
- Actions: Freeze (sets `creation_status='suspended'` — team is hidden from athletes, becomes read-only), Unfreeze, Delete (hard delete with confirmation; cascade RLS-protected).

### 7.2 Approval toggle

Toggle for `platform_settings.require_team_approval`. Off by default (self-service). When on, new team creations sit in `creation_status='pending'` and surface in a separate "Pending team requests" tab.

### 7.3 Cross-team view (admin team switcher)

Platform admin (`is_platform_admin=true`) can switch the active view to any team via the existing role-switcher pattern. On switch, `user_preferences.team_id` flips to the target. The role used for that view is determined as:
1. If the admin has a real `team_memberships` row on the target team with `status='active'` → use that role.
2. Otherwise → use a synthetic `coach` role for read+write access. No membership row is created automatically; the admin is "passing through" the team without joining.

This means a platform admin can read every team's data and act as a coach on any team without polluting membership rosters. Sub-2 polishes the switcher UI; this sub-project ensures it's at least functional from day one.

## 8. Activity-tab visibility

Per-team setting `activity_visibility`:
- `public` (default) — every active member of the team can see the team-wide Activity feed.
- `coaches_only` — only `role in ('coach','captain')` see team-wide; athletes still see their own profile activity.

Toggleable from team settings. Athletes always read/intake their own activity rows regardless of this setting.

## 9. Implementation phases

| Phase | Scope | Visible deliverable |
|---|---|---|
| **1a** | Schema + migration | `team_memberships`, `teams.team_code`, `teams.creation_status`, `teams.activity_visibility`, `platform_settings`, RLS, seed existing data |
| **1b** | Athlete request flow | "Find a team" UI, request submission, pending banner, cancel-request action |
| **1c** | Coach approval UI | Pending requests inbox, approve/deny actions, server-side player creation on approve |
| **1d** | Team creation + admin panel | Coach team-creation form, all-teams admin panel, freeze/unfreeze, approval toggle |
| **1e** | Notifications + polish | Realtime auto-redirect on decision, decision SMS via scheduled_sends, deny-reason flow |

Each phase is independently testable. 1a is foundational; the others can ship in any order after that, though 1b → 1c is the most natural first user journey to enable end-to-end.

## 10. Open questions / risks

- **Team-code length and format.** Auto-generated. Proposal: 6 chars, lowercase + digits, ambiguity-free alphabet (no O/0/I/l/1). Long enough that brute-forcing a specific team is hard; short enough that coaches can text it.
- **Spam / abuse on self-request.** Mitigations: rate-limit per-IP and per-clerk-user (e.g. 5 requests / day), team admin can deny without reason. If abuse becomes a real problem, the platform-admin can flip `require_team_approval`.
- **Phone change / re-claim.** Out of scope for sub-1. Athlete with a new phone has no match → goes through the request flow as a new user. Manual merge by coach for now.
- **Existing user_preferences.team_id staying in the schema.** Tech debt — fine for the transition, plan to remove in sub-2 once the team switcher is shipped and all callers route through `team_memberships`.
- **Multi-platform-admin in the future.** Currently `is_platform_admin` is just a boolean; if we need multiple admins or audit trails, we promote it to a separate `platform_admins` table later.
- **Invite-only teams.** Today every `creation_status='active'` team appears in the public browse list. If a team wants to stay code-only (no public listing), we can add a `discoverable boolean default true` flag to `teams` later — non-discoverable teams skip the browse list, but a code holder can still join. Out of scope for sub-1.

## 11. Success criteria

A coach who has never used reflect-live can:
1. Sign up via Clerk.
2. Create a team via `/dashboard/team/new`.
3. Share the team code with athletes.
4. See requests come in on their dashboard.
5. Approve or deny each one.

An athlete who has never used reflect-live can:
1. Sign up via Clerk.
2. Verify their phone.
3. Find their team via browse or code.
4. Submit a request.
5. See the pending banner.
6. Get auto-redirected to the dashboard the moment their coach approves.

The existing UChicago Swim team works exactly as it does today after migration: existing `user_preferences` rows become memberships, existing rosters keep their phone-match auto-join behavior, no end-user-visible regression.

The men's/women's swim split becomes: create two new teams via the new flow, migrate or re-request memberships per gender, retire the original team if desired.
