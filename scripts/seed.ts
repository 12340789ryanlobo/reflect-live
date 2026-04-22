import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { parseSwimCsv, type CsvRow } from './parse-csv';
import { assertSafeReflectDbPath } from './path-guard';

const TEAM_CODE = 'uchicago-swim';
const TEAM_NAME = 'UChicago Swim & Dive';

/**
 * Heuristics for identifying a swim-related reflect player.
 * Reflect's prod DB has mixed teams (tennis was the original); we need to avoid
 * importing tennis players into the swim roster.
 *
 * A reflect player counts as "swim" if ANY of these match:
 *   - phone_e164 exists in our swim CSV
 *   - group_tags (or "group"/"group_tags_json") string contains a known swim group token
 *   - team name/code is "uchicago-swim" or similar
 */
const SWIM_GROUP_TOKENS = [
  'sprint', 'mid d', 'mid-d', 'middistance', 'distance', 'dive', 'diving',
  'free', 'back', 'breast', 'fly', 'im', 'swim',
];

function looksSwim(
  groupTags: string | null | undefined,
  teamName: string | null | undefined,
): boolean {
  const hay = `${groupTags ?? ''} ${teamName ?? ''}`.toLowerCase();
  return SWIM_GROUP_TOKENS.some((tok) => hay.includes(tok));
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var required`);
  return v;
}

async function confirm(msg: string): Promise<boolean> {
  if (process.argv.includes('--yes')) return true;
  process.stdout.write(msg + ' (y/N) ');
  return await new Promise((res) => {
    process.stdin.once('data', (d) => res(d.toString().trim().toLowerCase() === 'y'));
  });
}

interface ReflectPlayerRow {
  id: number;
  name: string;
  phone_e164: string;
  group_tags: string | null;
  team_id: number | null;
  team_name: string | null;
  active: number;
}

interface ActivityRow {
  player_id: number;
  description: string;
  image_path: string | null;
  logged_at: string;
  kind: 'workout' | 'rehab';
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const csvPath = process.env.SWIM_CSV_PATH ?? 'data/swim_team_contacts.csv';
  const reflectDbPath = process.env.REFLECT_DB_COPY_PATH;

  if (!existsSync(csvPath)) throw new Error(`CSV not found at ${csvPath}`);
  const csvRows: CsvRow[] = parseSwimCsv(readFileSync(csvPath, 'utf8'));
  console.log(`[csv] Parsed ${csvRows.length} swim players from ${csvPath}`);

  const csvPhoneSet = new Set(csvRows.map((r) => r.phone_e164));

  // ------- Phase 2: discovery from reflect prod DB -------
  let discoveredPlayers: ReflectPlayerRow[] = [];
  let activityRaw: Array<{ reflect_player_id: number; kind: 'workout' | 'rehab'; description: string; image_path: string | null; logged_at: string }> = [];

  if (reflectDbPath) {
    assertSafeReflectDbPath(reflectDbPath);
    if (!existsSync(reflectDbPath)) throw new Error(`REFLECT_DB_COPY_PATH file missing: ${reflectDbPath}`);
    console.log(`[reflect] Opening DB (read-only): ${reflectDbPath}`);
    const sqlite = new Database(reflectDbPath, { readonly: true, fileMustExist: true });
    try {
      // Detect whether a teams table + join exists
      const hasTeams = (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='teams'`).get() as any) != null;
      const playerSql = hasTeams
        ? `SELECT p.id, p.name, p.phone_e164, p.group_tags, p.team_id, p.active, t.name AS team_name
             FROM players p LEFT JOIN teams t ON t.id = p.team_id`
        : `SELECT p.id, p.name, p.phone_e164, p.group_tags, p.team_id, p.active, NULL AS team_name
             FROM players p`;
      const allPlayers = sqlite.prepare(playerSql).all() as ReflectPlayerRow[];
      console.log(`[reflect] Found ${allPlayers.length} total players in prod DB`);

      discoveredPlayers = allPlayers.filter((p) =>
        csvPhoneSet.has(p.phone_e164) ||
        looksSwim(p.group_tags, p.team_name),
      );
      console.log(`[reflect] Identified ${discoveredPlayers.length} as swim-team (via phone + group/team heuristics)`);

      const newByPhone = discoveredPlayers.filter((p) => !csvPhoneSet.has(p.phone_e164));
      if (newByPhone.length) {
        console.log(`[reflect] ${newByPhone.length} player(s) in reflect NOT in CSV — will be imported:`);
        for (const p of newByPhone) console.log(`  + ${p.name} (${p.phone_e164}) [${p.group_tags ?? 'no group'}]`);
      }

      const reflectPlayerIds = discoveredPlayers.map((p) => p.id);
      if (reflectPlayerIds.length) {
        const placeholders = reflectPlayerIds.map(() => '?').join(',');
        const workouts = sqlite.prepare(
          `SELECT player_id as reflect_player_id, description, image_path, logged_at
             FROM workouts WHERE player_id IN (${placeholders})`
        ).all(...reflectPlayerIds) as any[];
        const rehabs = sqlite.prepare(
          `SELECT player_id as reflect_player_id, description, image_path, logged_at
             FROM rehabs WHERE player_id IN (${placeholders})`
        ).all(...reflectPlayerIds) as any[];
        activityRaw = [
          ...workouts.map((w) => ({ ...w, kind: 'workout' as const })),
          ...rehabs.map((r) => ({ ...r, kind: 'rehab' as const })),
        ];
      }
      console.log(`[reflect] Found ${activityRaw.length} activity logs (workouts + rehabs) for identified swim players`);
    } finally {
      sqlite.close();
    }
  } else {
    console.log('[reflect] REFLECT_DB_COPY_PATH not set — skipping reflect prod import');
  }

  // ------- Build the merged player set -------
  // Start with CSV (authoritative names + groups), overlay any reflect-discovered
  // swim players that aren't in the CSV. CSV values win on conflict.
  const mergedByPhone = new Map<string, { name: string; phone_e164: string; group: string | null; active: boolean }>();
  for (const r of csvRows) mergedByPhone.set(r.phone_e164, { ...r, active: true });
  for (const rp of discoveredPlayers) {
    if (mergedByPhone.has(rp.phone_e164)) continue; // CSV wins
    const firstGroup = (rp.group_tags ?? '').split(',')[0]?.trim() || null;
    mergedByPhone.set(rp.phone_e164, {
      name: rp.name,
      phone_e164: rp.phone_e164,
      group: firstGroup,
      active: Boolean(rp.active),
    });
  }
  const totalPlayers = mergedByPhone.size;

  // ------- Confirm -------
  const ok = await confirm(
    `Insert 1 team + ${totalPlayers} players (${totalPlayers - csvRows.length} new from reflect) + ${activityRaw.length} activity logs into ${supabaseUrl}?`,
  );
  if (!ok) { console.log('Aborted.'); process.exit(0); }

  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Team
  const { data: team, error: teamErr } = await sb.from('teams')
    .upsert({ name: TEAM_NAME, code: TEAM_CODE }, { onConflict: 'code' })
    .select().single();
  if (teamErr) throw teamErr;
  console.log(`✓ team id=${team.id}`);

  // Players (upsert by team_id+phone_e164)
  const playerUpsertRows = Array.from(mergedByPhone.values()).map((p) => ({
    team_id: team.id,
    name: p.name,
    phone_e164: p.phone_e164,
    group: p.group,
    active: p.active,
  }));
  const { error: playersErr } = await sb.from('players').upsert(playerUpsertRows, { onConflict: 'team_id,phone_e164' });
  if (playersErr) throw playersErr;
  console.log(`✓ ${playerUpsertRows.length} players upserted`);

  // Map reflect_player_id → Supabase player_id
  const { data: supaPlayers, error: pFetchErr } = await sb.from('players').select('id,phone_e164').eq('team_id', team.id);
  if (pFetchErr) throw pFetchErr;
  const supaByPhone = new Map((supaPlayers ?? []).map((p) => [p.phone_e164, p.id as number]));
  const reflectIdToPhone = new Map(discoveredPlayers.map((p) => [p.id, p.phone_e164]));

  // Activity logs — clean-and-reimport pattern (safe to re-run)
  if (activityRaw.length > 0) {
    const activityRows = activityRaw
      .map((a) => {
        const phone = reflectIdToPhone.get(a.reflect_player_id);
        if (!phone) return null;
        const supaPlayerId = supaByPhone.get(phone);
        if (!supaPlayerId) return null;
        return {
          player_id: supaPlayerId,
          team_id: team.id,
          kind: a.kind,
          description: a.description,
          image_path: a.image_path,
          logged_at: new Date(a.logged_at).toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    console.log(`[insert] ${activityRows.length} activity logs (after mapping to Supabase player_ids)`);

    // Delete existing rows for this team first so this import is idempotent.
    // We don't touch any data in reflect — just clearing our own Supabase cache.
    console.log(`[cleanup] clearing existing activity_logs for team ${team.id} before reimport`);
    const { error: delErr } = await sb.from('activity_logs').delete().eq('team_id', team.id);
    if (delErr) throw delErr;

    // Insert in chunks of 500 (Supabase has a row-count cap for single inserts)
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < activityRows.length; i += chunkSize) {
      const chunk = activityRows.slice(i, i + chunkSize);
      const { error: insErr } = await sb.from('activity_logs').insert(chunk);
      if (insErr) throw insErr;
      inserted += chunk.length;
      process.stdout.write(`  inserted ${inserted}/${activityRows.length}\r`);
    }
    console.log(`\n✓ activity_logs populated (${inserted} rows)`);
  }

  const { count: playersCount } = await sb.from('players').select('id', { count: 'exact', head: true }).eq('team_id', team.id);
  const { count: activityCount } = await sb.from('activity_logs').select('id', { count: 'exact', head: true }).eq('team_id', team.id);
  console.log(`\nFinal state in Supabase:`);
  console.log(`  players:       ${playersCount}`);
  console.log(`  activity_logs: ${activityCount}`);

  console.log('\nSeed complete.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
