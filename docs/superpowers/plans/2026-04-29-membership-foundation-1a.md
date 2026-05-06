# Membership Foundation — Phase 1a (Schema + Migration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the data model that the rest of the membership-foundation work hangs off — `team_memberships` table, schema extensions on `teams` and `user_preferences`, the `platform_settings` row, RLS policies, a team-code generator, and a one-shot migration that seeds existing data without breakage.

**Architecture:** One Supabase migration file (`0015_membership_foundation.sql`) holds all DDL + the data backfill. Shared types live in `@reflect-live/shared`. A small TypeScript utility generates team codes (ambiguity-free 6-char strings). A verification script asserts the post-migration state so re-runs and dev-vs-prod parity are easy to check.

**Tech Stack:** Supabase Postgres, TypeScript (Vitest for unit tests), Bun for scripts, the existing `@reflect-live/shared` workspace package.

---

## File Structure

**Files to create:**
- `packages/shared/src/team-code.ts` — generator + the safe alphabet
- `apps/worker/tests/team-code.test.ts` — Vitest unit tests for the generator
- `supabase/migrations/0015_membership_foundation.sql` — schema + RLS + data backfill
- `scripts/verify-membership-migration.ts` — post-migration sanity script

**Files to modify:**
- `packages/shared/src/types.ts` — add membership-related types
- `packages/shared/src/index.ts` — re-export the new module

**Why this layout:** the team-code utility is a pure function that's reused by both the web app (when a coach creates a team) and the migration (to seed `team_code` on existing teams). Putting it in `@reflect-live/shared` keeps a single source of truth. The migration file is the single artifact you apply to Supabase. The verification script is the single check you run after applying it.

---

## Task 1: Team-code generator (TDD)

**Files:**
- Create: `packages/shared/src/team-code.ts`
- Create: `apps/worker/tests/team-code.test.ts`

The generator produces 6-character codes from a 32-letter ambiguity-free alphabet (no `0/O/I/1/l`). Codes are case-insensitive on input but stored lowercase.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/team-code.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateTeamCode, isValidTeamCode, TEAM_CODE_ALPHABET } from '@reflect-live/shared';

describe('generateTeamCode', () => {
  it('returns a 6-character lowercase string', () => {
    const code = generateTeamCode();
    expect(code).toMatch(/^[a-z2-9]{6}$/);
  });

  it('uses only the safe alphabet (no 0, o, 1, l, i)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateTeamCode();
      for (const ch of code) {
        expect(TEAM_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('produces different codes across calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) codes.add(generateTeamCode());
    expect(codes.size).toBeGreaterThan(15);
  });
});

describe('isValidTeamCode', () => {
  it('accepts a generated code', () => {
    expect(isValidTeamCode(generateTeamCode())).toBe(true);
  });

  it('accepts uppercase + lowercase mix and normalizes by case', () => {
    expect(isValidTeamCode('Abc234')).toBe(true);
  });

  it('rejects ambiguous letters', () => {
    expect(isValidTeamCode('abcdo1')).toBe(false);
    expect(isValidTeamCode('111111')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidTeamCode('abc')).toBe(false);
    expect(isValidTeamCode('abcdefg')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/worker && bunx vitest run tests/team-code.test.ts
```

Expected: FAIL with "Cannot find module '@reflect-live/shared'" or "generateTeamCode is not a function" — module doesn't exist yet.

- [ ] **Step 3: Implement the team-code module**

Create `packages/shared/src/team-code.ts`:

```ts
// Team-code generator. 6-char strings from a 32-letter ambiguity-free
// alphabet — no 0/O, 1/I/l. Used both by the web app (when a coach
// creates a team) and by migration 0015 (to seed team_code on existing
// teams). Stored lowercase; input is normalized by case.

export const TEAM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 6;

export function generateTeamCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += TEAM_CODE_ALPHABET[Math.floor(Math.random() * TEAM_CODE_ALPHABET.length)];
  }
  return out;
}

export function isValidTeamCode(input: string): boolean {
  if (typeof input !== 'string') return false;
  const lower = input.toLowerCase();
  if (lower.length !== CODE_LENGTH) return false;
  for (const ch of lower) {
    if (!TEAM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Re-export from the shared package**

Modify `packages/shared/src/index.ts` to add the new export. Open the file, find the existing exports, and add:

```ts
export * from './team-code.js';
```

The file should now look like (existing exports plus the new line):

```ts
export * from './types.js';
export * from './survey/index.js';
export * from './team-code.js';
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/worker && bunx vitest run tests/team-code.test.ts
```

Expected: PASS — all 7 tests green.

- [ ] **Step 6: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add packages/shared/src/team-code.ts packages/shared/src/index.ts apps/worker/tests/team-code.test.ts
git commit -m "feat(shared): team-code generator + isValidTeamCode

Ambiguity-free 32-letter alphabet (no 0/O/1/I/l), 6 characters,
lowercase canonical form. Used by the web app on team creation and
by migration 0015 to seed team_code on existing teams. 7 vitest
cases cover length, alphabet, randomness, and validation edge
cases (case-insensitive accept, ambiguous-letter reject, length
mismatch reject)."
```

---

## Task 2: Membership types in shared

**Files:**
- Modify: `packages/shared/src/types.ts`

Add the TypeScript shapes that the rest of phase 1a-1e reads. No tests — these are pure type aliases that get exercised by typecheck during downstream usage.

- [ ] **Step 1: Open `packages/shared/src/types.ts` and add new exports**

Find the end of the file (after the existing exports). Add:

```ts
// ---- Membership foundation (sub-1, see 2026-04-29 spec) -------------------

export type MembershipRole = 'athlete' | 'captain' | 'coach';

export type MembershipStatus =
  | 'requested'  // athlete asked to join, awaiting decision
  | 'invited'    // (sub-4) coach pre-invited, awaiting claim
  | 'active'     // confirmed both ways, full member
  | 'denied'     // coach declined the request (audit row)
  | 'left'       // athlete voluntarily left or withdrew request
  | 'removed';   // coach removed athlete from team

export type TeamCreationStatus = 'pending' | 'active' | 'suspended';

export type ActivityVisibility = 'public' | 'coaches_only';

export interface TeamMembership {
  clerk_user_id: string;
  team_id: number;
  player_id: number | null;
  role: MembershipRole;
  status: MembershipStatus;
  default_team: boolean;
  requested_name: string | null;
  requested_email: string | null;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  deny_reason: string | null;
}

export interface PlatformSettings {
  id: 1;
  require_team_approval: boolean;
}
```

- [ ] **Step 2: Update existing `Team` interface to include the new columns**

Find the existing `Team` interface in the same file (around line 10). Add the three new fields at the end:

```ts
export interface Team {
  id: number;
  name: string;
  code: string;
  created_at: string;
  description?: string | null;
  twilio_account_sid?: string | null;
  twilio_auth_token?: string | null;
  twilio_phone_number?: string | null;
  scoring_json: TeamScoring;
  default_gender: Gender;
  // Phase 1a additions:
  team_code: string | null;       // shareable join code
  creation_status: TeamCreationStatus;
  activity_visibility: ActivityVisibility;
}
```

- [ ] **Step 3: Update `UserPreferences` interface for the platform admin flag**

Find `UserPreferences` in the same file. Add:

```ts
export interface UserPreferences {
  clerk_user_id: string;
  team_id: number;
  watchlist: number[];
  group_filter: string | null;
  role: UserRole | null;
  impersonate_player_id: number | null;
  created_at: string;
  updated_at: string;
  // Phase 1a addition:
  is_platform_admin: boolean;
}
```

- [ ] **Step 4: Typecheck the workspace**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/packages/shared
bunx tsc --noEmit
```

Expected: no errors. (If `Team` is read elsewhere with the new fields missing, those callsites will fail — they shouldn't yet because the migration hasn't shipped, but if they do, those are downstream issues for the consumer to handle.)

- [ ] **Step 5: Typecheck the web app and worker too**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/web && bunx tsc --noEmit
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live/apps/worker && bunx tsc --noEmit | grep -v "TS2835\|implicitly has an 'any'"
```

Expected: web app clean. Worker output may contain pre-existing extension warnings (TS2835) — those are not introduced by this task and can be ignored.

- [ ] **Step 6: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add packages/shared/src/types.ts
git commit -m "feat(shared): types for membership foundation phase 1a

Adds TeamMembership, MembershipRole, MembershipStatus,
TeamCreationStatus, ActivityVisibility, PlatformSettings.
Extends Team with team_code/creation_status/activity_visibility
and UserPreferences with is_platform_admin so downstream code
gets the columns the migration is about to add."
```

---

## Task 3: Migration 0015 — schema + RLS + backfill

**Files:**
- Create: `supabase/migrations/0015_membership_foundation.sql`

This is the single artifact you apply to Supabase. Idempotent (`if not exists`, `do … begin/end` guards) so re-running it is safe.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/0015_membership_foundation.sql`:

```sql
-- Phase 1a — membership foundation.
--
-- Adds team_memberships (single source of truth for who's on which team
-- in what role and status), platform_settings (one-row global config),
-- and extends teams + user_preferences with the columns sub-1's flows
-- read. Backfills existing user_preferences as memberships and seeds a
-- team_code on every existing team.
--
-- Idempotent: re-running this migration is a no-op once it has been
-- applied. Safe to apply on dev or prod.

-- ==========================================================================
-- 1. team_memberships — primary membership table
-- ==========================================================================
create table if not exists team_memberships (
  clerk_user_id   text       not null,
  team_id         bigint     not null references teams(id),
  player_id       bigint     references players(id) on delete set null,
  role            text       not null default 'athlete'
                  check (role in ('athlete','captain','coach')),
  status          text       not null
                  check (status in (
                    'requested','invited','active','denied','left','removed'
                  )),
  default_team    boolean    not null default false,
  requested_name  text,
  requested_email text,
  requested_at    timestamptz default now(),
  decided_at      timestamptz,
  decided_by      text,
  deny_reason     text,
  primary key (clerk_user_id, team_id)
);

create unique index if not exists uq_one_default_per_user
  on team_memberships(clerk_user_id) where default_team;

create index if not exists idx_memberships_team_pending
  on team_memberships(team_id, requested_at desc) where status = 'requested';

create index if not exists idx_memberships_user_active
  on team_memberships(clerk_user_id) where status = 'active';

-- ==========================================================================
-- 2. teams extensions
-- ==========================================================================
alter table teams add column if not exists team_code text;
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where indexname = 'uq_teams_team_code'
  ) then
    create unique index uq_teams_team_code on teams(team_code) where team_code is not null;
  end if;
end$$;

alter table teams add column if not exists creation_status text not null default 'active'
  check (creation_status in ('pending','active','suspended'));

alter table teams add column if not exists activity_visibility text not null default 'public'
  check (activity_visibility in ('public','coaches_only'));

-- ==========================================================================
-- 3. user_preferences extension
-- ==========================================================================
alter table user_preferences add column if not exists
  is_platform_admin boolean not null default false;

-- ==========================================================================
-- 4. platform_settings — single-row global config
-- ==========================================================================
create table if not exists platform_settings (
  id int primary key default 1 check (id = 1),
  require_team_approval boolean not null default false
);
insert into platform_settings (id) values (1) on conflict (id) do nothing;

-- ==========================================================================
-- 5. RLS — read scoping for team_memberships
-- ==========================================================================
alter table team_memberships enable row level security;

-- Users see their own membership rows (any status — they need to see
-- pending requests they've made).
create policy memberships_self_read on team_memberships
  for select using (clerk_user_id = (auth.jwt() ->> 'sub'));

-- Coaches and captains see all rows on their team — to manage requests
-- and view the roster.
create policy memberships_team_managers_read on team_memberships
  for select using (
    team_id in (
      select team_id from team_memberships
      where clerk_user_id = (auth.jwt() ->> 'sub')
        and status = 'active'
        and role in ('coach','captain')
    )
  );

-- Platform admins see everything.
create policy memberships_platform_admin_read on team_memberships
  for select using (
    exists (
      select 1 from user_preferences
      where clerk_user_id = (auth.jwt() ->> 'sub')
        and is_platform_admin = true
    )
  );

-- All writes go through the service-role API. No client-side write policies.

alter table platform_settings enable row level security;
create policy platform_settings_admin_read on platform_settings
  for select using (
    exists (
      select 1 from user_preferences
      where clerk_user_id = (auth.jwt() ->> 'sub')
        and is_platform_admin = true
    )
  );

-- ==========================================================================
-- 6. Realtime — team_memberships streams so the athlete pending banner
--    can flip to 'active' the instant the coach approves.
-- ==========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'team_memberships'
  ) then
    alter publication supabase_realtime add table team_memberships;
  end if;
end$$;

-- ==========================================================================
-- 7. Backfill — seed memberships from existing user_preferences
-- ==========================================================================
-- For each user who already has a team_id on user_preferences, create an
-- active membership. Map the legacy 'admin' role to coach (team-level top
-- role); cross-team admin powers come from is_platform_admin below.
insert into team_memberships (
  clerk_user_id, team_id, player_id, role, status,
  default_team, requested_name, requested_email,
  requested_at, decided_at, decided_by, deny_reason
)
select
  up.clerk_user_id,
  up.team_id,
  up.impersonate_player_id,
  case when up.role = 'admin' then 'coach' else coalesce(up.role, 'athlete') end as role,
  'active',
  true,
  null, null,
  coalesce(up.created_at, now()),
  coalesce(up.created_at, now()),
  null,
  null
from user_preferences up
where up.team_id is not null
on conflict (clerk_user_id, team_id) do nothing;

-- Promote existing platform admins (legacy role='admin') to is_platform_admin.
update user_preferences
set is_platform_admin = true
where role = 'admin' and is_platform_admin = false;

-- Seed team_code for every existing team that doesn't have one. The
-- swim team gets the literal 'uchicago-swim' so it's a stable, known
-- code; any other existing teams get a safe random fallback.
update teams
set team_code = 'uchicago-swim'
where code = 'uchicago-swim' and team_code is null;

-- For any other teams missing a code, leave it null for now; the web
-- app's team-creation flow will assign one on first use, and an admin
-- can run a follow-up update if needed. (Most projects only have the
-- one swim team today; this branch is defensive.)
```

- [ ] **Step 2: Verify the migration file is syntactically correct by reviewing it**

Reread the file end to end. Confirm:
- Every `create … if not exists` is paired with the right object kind.
- The check constraints' value lists match the TypeScript type unions exactly (`status in ('requested','invited','active','denied','left','removed')` matches `MembershipStatus`).
- The realtime publication block is wrapped in the same `do $$ … $$` guard pattern as migration 0014.
- The backfill `on conflict … do nothing` ensures re-running doesn't duplicate memberships.

- [ ] **Step 3: Commit**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add supabase/migrations/0015_membership_foundation.sql
git commit -m "feat(db): membership foundation phase 1a — schema + RLS + backfill

0015_membership_foundation.sql:

- team_memberships table (composite PK on clerk_user_id, team_id)
  with status enum covering the full lifecycle (requested / invited /
  active / denied / left / removed). Partial indexes for common
  queries (one default-team per user, pending-by-team, active-by-user).
- teams: + team_code (unique partial index), creation_status,
  activity_visibility.
- user_preferences: + is_platform_admin.
- platform_settings: single-row global config (require_team_approval).
- RLS: users read their own rows; coaches/captains read all rows on
  their team; platform admin reads everything. Writes go via
  service-role API.
- Realtime: team_memberships added to publication.
- Backfill: legacy user_preferences become active memberships; legacy
  role='admin' rows become is_platform_admin=true; swim team gets
  team_code='uchicago-swim'.

Idempotent — safe to re-apply."
```

---

## Task 4: Verification script

**Files:**
- Create: `scripts/verify-membership-migration.ts`

A bun-runnable script that connects to Supabase via the worker's env file and asserts the post-migration state. Used immediately after applying the migration and re-runnable any time.

- [ ] **Step 1: Create the script**

Create `scripts/verify-membership-migration.ts`:

```ts
// Verification script for migration 0015 (membership foundation).
//
// Connects to the active Supabase project (using the worker's
// .env.local for credentials, same pattern as the other backfill
// scripts) and asserts the post-migration state:
//
//   1. team_memberships table exists and is non-empty (existing user
//      preferences should have been backfilled).
//   2. Each pre-existing user_preferences.team_id has a corresponding
//      active membership row.
//   3. Legacy admin user_preferences rows now have is_platform_admin=true.
//   4. The swim team has team_code='uchicago-swim'.
//   5. platform_settings has the single (id=1) row.
//
// Exits 0 on success, 1 on any assertion failure. Re-runnable.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(join(import.meta.dir, '..', 'apps', 'worker', '.env.local'), 'utf8');
const get = (k: string): string => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'));
  if (!m) throw new Error(`missing ${k}`);
  return m[1].trim();
};
const sb = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

let failed = 0;
function assertOK(label: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed += 1;
  }
}

async function main() {
  console.log('[verify] migration 0015 — membership foundation');

  // 1. team_memberships exists and is non-empty
  const { data: mem, error: memErr } = await sb
    .from('team_memberships')
    .select('clerk_user_id, team_id, role, status, default_team', { count: 'exact', head: false });
  if (memErr) throw new Error(`team_memberships query failed: ${memErr.message}`);
  assertOK('team_memberships table is queryable', !!mem);
  assertOK(
    'team_memberships has at least one row (backfill ran)',
    (mem ?? []).length > 0,
    `got ${(mem ?? []).length} rows`,
  );

  // 2. Each user_preferences row has a matching active membership
  const { data: prefs } = await sb
    .from('user_preferences')
    .select('clerk_user_id, team_id, role');
  for (const p of (prefs ?? []) as Array<{ clerk_user_id: string; team_id: number; role: string | null }>) {
    const match = (mem ?? []).find(
      (m) => m.clerk_user_id === p.clerk_user_id && m.team_id === p.team_id && m.status === 'active',
    );
    assertOK(
      `pref ${p.clerk_user_id} (team ${p.team_id}) has active membership`,
      !!match,
    );
  }

  // 3. Legacy admin prefs are now is_platform_admin
  const { data: admins } = await sb
    .from('user_preferences')
    .select('clerk_user_id, role, is_platform_admin')
    .eq('role', 'admin');
  for (const a of (admins ?? []) as Array<{ clerk_user_id: string; is_platform_admin: boolean }>) {
    assertOK(
      `legacy admin ${a.clerk_user_id} is_platform_admin=true`,
      a.is_platform_admin === true,
    );
  }

  // 4. Swim team has team_code='uchicago-swim'
  const { data: swim } = await sb
    .from('teams')
    .select('id, code, team_code')
    .eq('code', 'uchicago-swim')
    .maybeSingle();
  assertOK('swim team exists', !!swim);
  assertOK(
    "swim team team_code === 'uchicago-swim'",
    swim?.team_code === 'uchicago-swim',
    `got '${swim?.team_code}'`,
  );

  // 5. platform_settings has the single row
  const { data: ps } = await sb
    .from('platform_settings')
    .select('id, require_team_approval')
    .eq('id', 1)
    .maybeSingle();
  assertOK('platform_settings(id=1) exists', !!ps);
  assertOK(
    'platform_settings.require_team_approval defaults to false',
    ps?.require_team_approval === false,
  );

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Commit the script**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git add scripts/verify-membership-migration.ts
git commit -m "feat(scripts): verify membership foundation migration 0015

Bun-runnable post-migration check. Asserts team_memberships exists,
backfill ran for every legacy user_preferences row, legacy admins
got is_platform_admin=true, swim team has the literal team_code,
and platform_settings has the singleton row.

Run: bun run scripts/verify-membership-migration.ts"
```

---

## Task 5: Apply + verify against Supabase

**Files:** none (operational task).

This step is the user's gate — the SQL editor in Supabase is the only place to run DDL on their managed Postgres. The agent should NOT attempt to apply remote migrations on its own.

- [ ] **Step 1: Open the migration in the editor**

Open `supabase/migrations/0015_membership_foundation.sql` and copy the whole file to your clipboard.

- [ ] **Step 2: Apply via Supabase SQL editor**

Go to the Supabase project's SQL editor. Paste the migration. Run it. Confirm:
- No errors reported.
- "Success. No rows returned" or similar success message.

- [ ] **Step 3: Run the verification script locally**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
bun run scripts/verify-membership-migration.ts
```

Expected output (numbers may vary):

```
[verify] migration 0015 — membership foundation
  ✓ team_memberships table is queryable
  ✓ team_memberships has at least one row (backfill ran)
  ✓ pref user_3ChRRur1xt55Nlg610WzR8bkZAH (team 1) has active membership
  ✓ pref user_3D2jKG3EwsIz4OnTdK6F57YTkJU (team 1) has active membership
  ✓ pref user_3Cj2Uq6PQGYVXrSMaQT8TAsjgEh (team 1) has active membership
  ✓ legacy admin user_3ChRRur1xt55Nlg610WzR8bkZAH is_platform_admin=true
  ✓ swim team exists
  ✓ swim team team_code === 'uchicago-swim'
  ✓ platform_settings(id=1) exists
  ✓ platform_settings.require_team_approval defaults to false

All checks passed.
```

If any check fails: read the error, fix the migration or backfill, re-apply (it's idempotent), re-run the script.

- [ ] **Step 4: Push the branch**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/reflect-live
git push
```

Vercel auto-redeploys; the Phase 1a schema is now live in dev.

---

## What 1a delivers

After this plan ships:

- The full membership data model lives in Supabase.
- Existing users (you, the captain, the linked athlete) all have active membership rows pointing at the swim team — you keep your platform-admin powers via the `is_platform_admin` flag.
- The shared workspace exposes `TeamMembership`, `MembershipStatus`, etc. so phases 1b–1e can write API endpoints and UI against typed data.
- `team_code` is set on the swim team so the upcoming athlete-request flow has something to look up by.
- The verification script is the single command future migrations / phases can run to confirm the schema is healthy.

The next plan covers **Phase 1b** — the athlete onboarding UI (Find a team → request → pending banner) — and reads/writes the schema we just built.
