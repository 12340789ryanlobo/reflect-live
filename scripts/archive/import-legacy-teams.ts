/**
 * One-shot importer: bring three legacy reflect teams into reflect-live.
 *
 *   reflect's UChicagoMT       → UChicago Men's Tennis
 *   reflect's UChicagoDive     → UChicago Dive
 *   reflect's primordialsoup   → UChicago Track & Field
 *
 * For each: ensure a teams row exists (upsert on `code`), then upsert
 * every roster player into `players` (upsert on team_id+phone_e164).
 * Idempotent — re-running adds no duplicates.
 *
 * The UChicagoSwim key isn't imported here; the existing Men's /
 * Women's Swim & Dive teams (ids 1, 7) already cover that roster.
 *
 * Usage:
 *   REFLECT_URL=https://reflectsalus.app \
 *   REFLECT_KEY_TENNIS=<reflect-admin-key> \
 *   REFLECT_KEY_DIVE=<reflect-admin-key> \
 *   REFLECT_KEY_TRACK=<reflect-admin-key> \
 *   bun run scripts/import-legacy-teams.ts
 *
 * Pulls Supabase creds from apps/web/.env.local so you don't have to
 * pass them on the command line.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface ReflectPlayer {
  id: number;
  team_id: number;
  name: string;
  phone_e164: string;
  group_tags: string | null;
  active: 0 | 1;
}

interface TeamSpec {
  /** Internal slug — also the upsert key on teams.code. */
  code: string;
  /** Display name shown across the dashboard. */
  name: string;
  /** Default gender for the dashboard's gender-aware bits. */
  default_gender: 'male' | 'female';
  /** Env var holding the reflect coach admin key for this team. */
  envKey: string;
}

const TEAM_SPECS: TeamSpec[] = [
  { code: 'uchicago-mens-tennis', name: "UChicago Men's Tennis",   default_gender: 'male', envKey: 'REFLECT_KEY_TENNIS' },
  { code: 'uchicago-dive',        name: 'UChicago Dive',            default_gender: 'male', envKey: 'REFLECT_KEY_DIVE'   },
  { code: 'uchicago-track-field', name: 'UChicago Track & Field',   default_gender: 'male', envKey: 'REFLECT_KEY_TRACK'  },
];

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return v;
}

function loadEnvLocal() {
  // Read apps/web/.env.local for the Supabase creds so the operator
  // doesn't have to remember to pass them through the shell.
  try {
    const file = readFileSync(resolve(import.meta.dir, '..', 'apps', 'web', '.env.local'), 'utf8');
    for (const line of file.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
    }
  } catch {
    // .env.local optional — operator can also pass the vars in the shell.
  }
}

// Reflect's `group_tags` is comma-separated. Pick the first
// recognizable group label; mirrors seed-from-reflect-api.ts.
const KNOWN_GROUPS = ['Sprint', 'MidD', 'Mid D', 'Distance', 'Dive', 'Diving', 'Free', 'Back', 'Breast', 'Fly', 'IM', 'Singles', 'Doubles', 'Field', 'Throws', 'Jumps', 'Hurdles'];
function primaryGroup(tags: string | null): string | null {
  if (!tags) return null;
  const parts = tags.split(',').map((s) => s.trim()).filter(Boolean);
  const preferred = parts.find((p) => KNOWN_GROUPS.some((k) => k.toLowerCase() === p.toLowerCase()));
  return preferred ?? parts[0] ?? null;
}

/** 6-char invite code: lowercase alphanumeric, no vowels to avoid
 *  accidental words. Matches the format from
 *  packages/shared/src/team-code.ts without importing it (keeps the
 *  script standalone). */
function generateTeamCode(): string {
  const alphabet = 'bcdfghjkmnpqrstvwxyz23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function fetchRoster(reflectUrl: string, adminKey: string): Promise<ReflectPlayer[]> {
  const res = await fetch(`${reflectUrl}/admin/players`, { headers: { 'X-Admin-Key': adminKey } });
  if (!res.ok) throw new Error(`/admin/players → ${res.status}`);
  const json = (await res.json()) as { players?: ReflectPlayer[] };
  return json.players ?? [];
}

async function ensureTeam(sb: SupabaseClient, spec: TeamSpec): Promise<{ id: number; created: boolean }> {
  // Look first — keeps existing team_code stable if we re-run.
  const { data: existing } = await sb
    .from('teams')
    .select('id, team_code')
    .eq('code', spec.code)
    .maybeSingle<{ id: number; team_code: string | null }>();

  if (existing?.id) {
    return { id: existing.id, created: false };
  }

  // Insert a fresh team. Retry the team_code generation on the rare
  // collision (alphabet keeps it short but not collision-free).
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTeamCode();
    const { data, error } = await sb
      .from('teams')
      .insert({
        name: spec.name,
        code: spec.code,
        default_gender: spec.default_gender,
        team_code: candidate,
        creation_status: 'active',
        scoring_json: { workout_score: 10, rehab_score: 5 },
        activity_visibility: 'public',
      })
      .select('id')
      .single();
    if (!error && data) return { id: data.id, created: true };
    if (error && !error.message.includes('team_code')) throw error;
  }
  throw new Error(`could not allocate team_code for ${spec.name}`);
}

async function main() {
  loadEnvLocal();
  const supabaseUrl = need('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = need('SUPABASE_SERVICE_ROLE_KEY');
  const reflectUrl = need('REFLECT_URL').replace(/\/$/, '');

  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const summary: Array<{ team: string; team_id: number; created: boolean; players_upserted: number; from_reflect_rows: number }> = [];

  for (const spec of TEAM_SPECS) {
    const adminKey = need(spec.envKey);
    console.log(`\n=== ${spec.name} (${spec.code}) ===`);

    const roster = await fetchRoster(reflectUrl, adminKey);
    console.log(`  reflect roster: ${roster.length} rows`);

    const { id: teamId, created } = await ensureTeam(sb, spec);
    console.log(`  team_id=${teamId}  ${created ? '(created)' : '(existing)'}`);

    if (roster.length === 0) {
      summary.push({ team: spec.name, team_id: teamId, created, players_upserted: 0, from_reflect_rows: 0 });
      continue;
    }

    // Build dedupe map by phone — reflect can list the same number
    // twice on rare cases; upserting with both would still work but
    // is wasteful.
    const byPhone = new Map<string, ReflectPlayer>();
    for (const p of roster) {
      if (p.phone_e164) byPhone.set(p.phone_e164, p);
    }
    const playerRows = Array.from(byPhone.values()).map((p) => ({
      team_id: teamId,
      name: p.name,
      phone_e164: p.phone_e164,
      group: primaryGroup(p.group_tags),
      active: Boolean(p.active),
    }));

    const { error: pErr } = await sb.from('players').upsert(playerRows, { onConflict: 'team_id,phone_e164' });
    if (pErr) throw pErr;
    console.log(`  upserted ${playerRows.length} players`);

    summary.push({ team: spec.name, team_id: teamId, created, players_upserted: playerRows.length, from_reflect_rows: roster.length });
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
