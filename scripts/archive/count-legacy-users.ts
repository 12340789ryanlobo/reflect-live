/**
 * One-shot: count legacy users on reflect (reflectsalus.app) so we can
 * bake the number into the admin page as a snapshot. Doesn't import
 * any data — just calls GET /admin/players for each provided key,
 * dedupes by E.164 phone, prints summary.
 *
 * Reflect uses per-coach admin keys; pass them comma-separated:
 *
 *   REFLECT_URL=https://reflectsalus.app \
 *   REFLECT_ADMIN_KEYS="keyA,keyB,keyC" \
 *   bun run scripts/count-legacy-users.ts
 *
 * Single-key REFLECT_ADMIN_KEY is also accepted for backwards
 * compatibility with the seed scripts. Output is plain JSON so the
 * number can be pasted directly into a chat / commit message. No
 * data is persisted to disk.
 */

interface ReflectPlayer {
  id: number;
  team_id: number;
  name: string;
  phone_e164: string;
  active: 0 | 1;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const reflectUrl = need('REFLECT_URL').replace(/\/$/, '');
  const single = process.env.REFLECT_ADMIN_KEY;
  const multi = process.env.REFLECT_ADMIN_KEYS;
  const keys = (multi ?? single ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    console.error('Provide REFLECT_ADMIN_KEY=... (single) or REFLECT_ADMIN_KEYS="k1,k2,..." (multi).');
    process.exit(1);
  }

  // Per-key tally + global dedup. We don't log the keys themselves —
  // just an index — so the script output is safe to paste into a chat.
  const allPhones = new Set<string>();
  const allTeamIds = new Set<number>();
  let allActive = 0;
  const perKey: Array<{ key_index: number; rows: number; teams: number; active: number; status: string }> = [];

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const url = `${reflectUrl}/admin/players`;
    try {
      const res = await fetch(url, { headers: { 'X-Admin-Key': k } });
      if (!res.ok) {
        perKey.push({ key_index: i, rows: 0, teams: 0, active: 0, status: `HTTP ${res.status}` });
        continue;
      }
      const json = (await res.json()) as { players?: ReflectPlayer[] };
      const players = json.players ?? [];
      const keyTeams = new Set<number>();
      let keyActive = 0;
      for (const p of players) {
        if (p.phone_e164) allPhones.add(p.phone_e164);
        allTeamIds.add(p.team_id);
        keyTeams.add(p.team_id);
        if (p.active === 1) {
          keyActive += 1;
          allActive += 1;  // note: may double-count active flag for a player who is active on key A and inactive on key B; distinct_active below corrects.
        }
      }
      perKey.push({ key_index: i, rows: players.length, teams: keyTeams.size, active: keyActive, status: 'ok' });
    } catch (e) {
      perKey.push({ key_index: i, rows: 0, teams: 0, active: 0, status: (e as Error).message });
    }
  }

  // Re-derive distinct_active by re-walking but tracking phones.
  // Same logic but ensures a player active on any key counts once.
  const activePhones = new Set<string>();
  for (let i = 0; i < keys.length; i++) {
    try {
      const res = await fetch(`${reflectUrl}/admin/players`, { headers: { 'X-Admin-Key': keys[i] } });
      if (!res.ok) continue;
      const json = (await res.json()) as { players?: ReflectPlayer[] };
      for (const p of json.players ?? []) {
        if (p.active === 1 && p.phone_e164) activePhones.add(p.phone_e164);
      }
    } catch { /* already accounted for above */ }
  }

  const result = {
    snapshot_at: new Date().toISOString(),
    keys_tried: keys.length,
    per_key: perKey,
    aggregated: {
      distinct_phones: allPhones.size,
      distinct_active: activePhones.size,
      distinct_teams: allTeamIds.size,
    },
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
