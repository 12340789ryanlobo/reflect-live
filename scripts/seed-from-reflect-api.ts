/**
 * Import from reflect's production API (no SQLite download needed).
 *
 * Fetches:
 *   - GET /admin/players     → swim roster (team_id=4)
 *   - GET /api/ui/fitness/team?days=N → all swim workouts
 *
 * Rehabs aren't exposed as a bulk API, but inbound "rehab: …" SMS messages
 * are already captured by the worker into `twilio_messages` with
 * category='rehab', so nothing is lost.
 *
 * Usage:
 *   REFLECT_URL=https://reflectsalus.app \
 *   REFLECT_ADMIN_KEY=... \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   bun run scripts/seed-from-reflect-api.ts
 */

import { createClient } from '@supabase/supabase-js';

const TEAM_CODE = 'uchicago-swim';
const TEAM_NAME = 'UChicago Swim & Dive';
const REFLECT_SWIM_TEAM_ID = 4; // team_id in reflect's prod DB

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var required`);
  return v;
}

interface ReflectPlayer {
  id: number;
  team_id: number;
  name: string;
  phone_e164: string;
  group_tags: string | null;
  active: 0 | 1;
}

interface ReflectWorkout {
  id: number;
  player_id: number;
  team_id: number;
  description: string;
  image_path: string | null;
  logged_at: string;
  player_name: string;
}

async function rest<T>(url: string, adminKey: string): Promise<T> {
  const res = await fetch(url, { headers: { 'X-Admin-Key': adminKey } });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const reflectUrl = (process.env.REFLECT_URL ?? 'https://reflectsalus.app').replace(/\/$/, '');
  const adminKey = requireEnv('REFLECT_ADMIN_KEY');
  const days = Number(process.env.REFLECT_DAYS ?? 365);

  // --- 1. Fetch from reflect ---
  console.log(`[reflect] GET ${reflectUrl}/admin/players`);
  const { players: allPlayers } = await rest<{ players: ReflectPlayer[] }>(
    `${reflectUrl}/admin/players`, adminKey,
  );
  const swim = allPlayers.filter((p) => p.team_id === REFLECT_SWIM_TEAM_ID);
  console.log(`[reflect] total=${allPlayers.length} swim=${swim.length} active=${swim.filter((p) => p.active).length}`);

  console.log(`[reflect] GET ${reflectUrl}/api/ui/fitness/team?days=${days}`);
  const { workouts } = await rest<{ workouts: ReflectWorkout[] }>(
    `${reflectUrl}/api/ui/fitness/team?days=${days}`, adminKey,
  );
  const swimWorkouts = workouts.filter((w) => w.team_id === REFLECT_SWIM_TEAM_ID);
  console.log(`[reflect] workouts=${swimWorkouts.length} from last ${days}d`);

  // --- 2. Upsert team ---
  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data: team, error: teamErr } = await sb.from('teams')
    .upsert({ name: TEAM_NAME, code: TEAM_CODE }, { onConflict: 'code' })
    .select().single();
  if (teamErr) throw teamErr;
  console.log(`✓ team id=${team.id}`);

  // --- 3. Upsert all swim players ---
  // The reflect "group_tags" field is a comma-separated string of tags. We pick the
  // first tag that matches a known stroke/group label so our dashboard has a clean
  // single-group display. Falls back to the first tag, then null.
  const KNOWN_GROUPS = ['Sprint', 'MidD', 'Mid D', 'Distance', 'Dive', 'Diving', 'Free', 'Back', 'Breast', 'Fly', 'IM'];
  function primaryGroup(tags: string | null): string | null {
    if (!tags) return null;
    const parts = tags.split(',').map((s) => s.trim()).filter(Boolean);
    const preferred = parts.find((p) => KNOWN_GROUPS.some((k) => k.toLowerCase() === p.toLowerCase()));
    return preferred ?? parts[0] ?? null;
  }

  const playerRows = swim.map((p) => ({
    team_id: team.id,
    name: p.name,
    phone_e164: p.phone_e164,
    group: primaryGroup(p.group_tags),
    active: Boolean(p.active),
  }));
  const { error: pErr } = await sb.from('players').upsert(playerRows, { onConflict: 'team_id,phone_e164' });
  if (pErr) throw pErr;
  console.log(`✓ ${playerRows.length} players upserted`);

  // --- 4. Reflect player_id → Supabase player_id map (via phone) ---
  const { data: supaPlayers, error: spErr } = await sb.from('players').select('id,phone_e164').eq('team_id', team.id);
  if (spErr) throw spErr;
  const phoneToSupaId = new Map((supaPlayers ?? []).map((r) => [r.phone_e164, r.id as number]));
  const reflectIdToPhone = new Map(swim.map((p) => [p.id, p.phone_e164]));

  // --- 5. Clean + bulk insert activity_logs (workouts) ---
  console.log(`[cleanup] deleting existing activity_logs for team ${team.id}`);
  const { error: delErr } = await sb.from('activity_logs').delete().eq('team_id', team.id);
  if (delErr) throw delErr;

  const activityRows = swimWorkouts
    .map((w) => {
      const phone = reflectIdToPhone.get(w.player_id);
      if (!phone) return null;
      const supaPlayerId = phoneToSupaId.get(phone);
      if (!supaPlayerId) return null;
      return {
        player_id: supaPlayerId,
        team_id: team.id,
        kind: 'workout' as const,
        description: w.description,
        image_path: w.image_path,
        logged_at: new Date(w.logged_at).toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  console.log(`[insert] ${activityRows.length} workout rows to insert (skipped ${swimWorkouts.length - activityRows.length} that couldn't be mapped)`);

  const chunkSize = 500;
  for (let i = 0; i < activityRows.length; i += chunkSize) {
    const chunk = activityRows.slice(i, i + chunkSize);
    const { error: insErr } = await sb.from('activity_logs').insert(chunk);
    if (insErr) throw insErr;
    process.stdout.write(`  inserted ${Math.min(i + chunkSize, activityRows.length)}/${activityRows.length}\r`);
  }
  console.log(`\n✓ activity_logs populated`);

  // --- 6. Final counts ---
  const { count: pc } = await sb.from('players').select('id', { count: 'exact', head: true }).eq('team_id', team.id);
  const { count: ac } = await sb.from('activity_logs').select('id', { count: 'exact', head: true }).eq('team_id', team.id);
  console.log('\nFinal state:');
  console.log(`  players:       ${pc}`);
  console.log(`  activity_logs: ${ac}`);
  console.log('\n✅ reflect → reflect-live sync complete');
  process.exit(0);
}

main().catch((e) => { console.error('✗', e); process.exit(1); });
