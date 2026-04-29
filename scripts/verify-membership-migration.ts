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
    .select('clerk_user_id, team_id, role, status, default_team');
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
