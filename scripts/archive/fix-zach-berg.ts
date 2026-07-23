// Reverse the women's-team migration for Zach Berg (player_id=53), who is
// male but got swept into the female migration (his row had gender=female
// at the time). Moves him + his cascade rows back to team 1, and re-points
// his deliveries/responses from the cloned team-7 sessions back to the
// original team-1 sessions.
//
// Usage:
//   bun run scripts/fix-zach-berg.ts            # dry run (default)
//   bun run scripts/fix-zach-berg.ts --apply    # actually mutate

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('apps/web/.env.local', 'utf8');
const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))![1].trim();
const sb = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

const PLAYER_ID = 53; // Zach Berg
const FROM_TEAM = 7;  // currently sitting on women's team
const TO_TEAM = 1;    // belongs on men's team
const APPLY = process.argv.includes('--apply');
console.log(`=== fix Zach Berg (${APPLY ? 'APPLY' : 'DRY-RUN'}): player ${PLAYER_ID} team ${FROM_TEAM} → ${TO_TEAM} ===\n`);

// 1. Verify current state.
const { data: before } = await sb
  .from('players')
  .select('id,name,gender,team_id,active')
  .eq('id', PLAYER_ID)
  .maybeSingle();
if (!before) { console.error('player not found'); process.exit(1); }
console.log(`current: #${before.id} ${before.name} gender=${before.gender} team=${before.team_id}\n`);
if (before.team_id !== FROM_TEAM) {
  console.error(`expected team_id=${FROM_TEAM}, found ${before.team_id} — aborting`);
  process.exit(1);
}

// 2. Build cloned-session-id → original-session-id map. Cloned sessions on
// team 7 carry metadata_json.cloned_from_session_id → original team-1 id.
const { data: cloned } = await sb
  .from('sessions')
  .select('id, metadata_json')
  .eq('team_id', TO_TEAM === 1 ? FROM_TEAM : TO_TEAM) // clones live on team 7 (FROM_TEAM)
  .not('metadata_json->>cloned_from_session_id', 'is', null);
const cloneToOrig = new Map<number, number>();
for (const s of cloned ?? []) {
  const fromId = Number(
    (s.metadata_json as { cloned_from_session_id?: string | number } | null)
      ?.cloned_from_session_id,
  );
  if (fromId) cloneToOrig.set(s.id, fromId);
}
console.log(`session map: ${cloneToOrig.size} cloned sessions on team ${FROM_TEAM} → originals on team ${TO_TEAM}\n`);

// 3. Re-point Zach's deliveries from cloned → original.
let dShifted = 0;
for (const [cloneId, origId] of cloneToOrig) {
  const { count } = await sb
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', cloneId)
    .eq('player_id', PLAYER_ID);
  if ((count ?? 0) === 0) continue;
  if (APPLY) {
    const { error } = await sb
      .from('deliveries')
      .update({ session_id: origId })
      .eq('session_id', cloneId)
      .eq('player_id', PLAYER_ID);
    if (error) throw new Error(`deliveries update: ${error.message}`);
  }
  dShifted += count ?? 0;
}
console.log(`step 3: deliveries re-pointed → ${dShifted} rows`);

// 4. Re-point Zach's responses from cloned → original.
let rShifted = 0;
for (const [cloneId, origId] of cloneToOrig) {
  const { count } = await sb
    .from('responses')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', cloneId)
    .eq('player_id', PLAYER_ID);
  if ((count ?? 0) === 0) continue;
  if (APPLY) {
    const { error } = await sb
      .from('responses')
      .update({ session_id: origId })
      .eq('session_id', cloneId)
      .eq('player_id', PLAYER_ID);
    if (error) throw new Error(`responses update: ${error.message}`);
  }
  rShifted += count ?? 0;
}
console.log(`step 4: responses re-pointed → ${rShifted} rows`);

// 5. Cascade team_id back on per-player tables.
async function bulk(table: string, update: Record<string, unknown>): Promise<number> {
  const { count } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('player_id', PLAYER_ID)
    .eq('team_id', FROM_TEAM);
  if (APPLY && (count ?? 0) > 0) {
    const { error } = await sb
      .from(table)
      .update(update)
      .eq('player_id', PLAYER_ID)
      .eq('team_id', FROM_TEAM);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}
for (const table of ['twilio_messages', 'activity_logs', 'injury_reports', 'team_memberships']) {
  const n = await bulk(table, { team_id: TO_TEAM });
  console.log(`step 5: ${table}.team_id updated → ${n} rows`);
}

// 6. Update player's team_id (and ensure gender is correct).
if (APPLY) {
  const { error } = await sb
    .from('players')
    .update({ team_id: TO_TEAM, gender: 'male' })
    .eq('id', PLAYER_ID);
  if (error) throw new Error(`players: ${error.message}`);
}
console.log(`step 6: players.team_id → ${TO_TEAM}, gender=male`);

console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN COMPLETE'}.`);
if (!APPLY) console.log('re-run with --apply to actually mutate the DB.');
