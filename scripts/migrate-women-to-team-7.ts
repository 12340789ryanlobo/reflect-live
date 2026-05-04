// One-shot migration: split UChicago Swim & Dive's female athletes
// off team 1 (now Men's) into team 7 (Women's). Per the prior
// conversation, sessions get CLONED so women's history reads as if
// the teams were always separate; deliveries/responses move with
// the female players to the cloned session ids.
//
// Order matters — see the DAG in comments below. Each step is a
// single UPDATE / INSERT, and re-running is safe-ish:
//   - players already on team 7 are skipped (re-runs idempotent)
//   - cascades that already point to team 7 are no-ops
//   - sessions clone is the one step that's NOT idempotent, so we
//     check whether team 7 already has cloned sessions before doing
//     it again (presence of a session whose metadata.cloned_from
//     is set on team 7 → skip clone phase).
//
// Usage:
//   bun run scripts/migrate-women-to-team-7.ts --dry-run    # preview
//   bun run scripts/migrate-women-to-team-7.ts --apply      # actually run

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('apps/web/.env.local', 'utf8');
const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))![1].trim();
const sb = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

const FROM_TEAM = 1;
const TO_TEAM = 7;
const APPLY = process.argv.includes('--apply');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';
console.log(`=== migration ${MODE}: female athletes from team ${FROM_TEAM} → team ${TO_TEAM} ===\n`);

// 0. Verify destination team exists.
const { data: dest } = await sb
  .from('teams')
  .select('id,name,default_gender')
  .eq('id', TO_TEAM)
  .maybeSingle();
if (!dest) {
  console.error(`team ${TO_TEAM} not found — aborting`);
  process.exit(1);
}
console.log(`destination: ${dest.name} (id=${dest.id}, default_gender=${dest.default_gender})\n`);

// 1. Identify female players still on team 1.
const { data: female } = await sb
  .from('players')
  .select('id,name,gender,team_id')
  .eq('team_id', FROM_TEAM)
  .eq('gender', 'female');
const femaleIds = (female ?? []).map((p) => p.id);
console.log(`step 1: ${femaleIds.length} female players to move`);
if (femaleIds.length === 0) {
  console.log('no female players left on team 1 — nothing to migrate.');
  process.exit(0);
}

// Helper: run an UPDATE only when --apply, otherwise just count.
async function bulk(
  table: string,
  match: (q: any) => any,
  update: Record<string, unknown>,
): Promise<number> {
  let countQ = sb.from(table).select('*', { count: 'exact', head: true });
  countQ = match(countQ);
  const { count } = await countQ;
  if (APPLY && (count ?? 0) > 0) {
    let upd = sb.from(table).update(update);
    upd = match(upd);
    const { error } = await upd;
    if (error) throw new Error(`${table} update failed: ${error.message}`);
  }
  return count ?? 0;
}

// 2. Update players.team_id.
{
  const n = await bulk(
    'players',
    (q) => q.in('id', femaleIds),
    { team_id: TO_TEAM },
  );
  console.log(`step 2: players.team_id updated → ${n} rows`);
}

// 3. Cascade team_id on per-player tables.
for (const table of ['twilio_messages', 'activity_logs', 'injury_reports', 'team_memberships']) {
  const n = await bulk(
    table,
    (q) => q.in('player_id', femaleIds).eq('team_id', FROM_TEAM),
    { team_id: TO_TEAM },
  );
  console.log(`step 3: ${table}.team_id updated → ${n} rows`);
}

// 4. Sessions clone. Skip if team 7 already has sessions cloned from
// a prior run (metadata_json->>'cloned_from_session_id' IS NOT NULL).
const { count: alreadyCloned } = await sb
  .from('sessions')
  .select('id', { count: 'exact', head: true })
  .eq('team_id', TO_TEAM)
  .not('metadata_json->>cloned_from_session_id', 'is', null);
let oldToNew = new Map<number, number>();
if ((alreadyCloned ?? 0) > 0) {
  console.log(`step 4: women's team already has ${alreadyCloned} cloned sessions — building map from existing rows`);
  const { data: existing } = await sb
    .from('sessions')
    .select('id, metadata_json')
    .eq('team_id', TO_TEAM)
    .not('metadata_json->>cloned_from_session_id', 'is', null);
  for (const r of existing ?? []) {
    const fromId = Number(
      (r.metadata_json as { cloned_from_session_id?: string | number } | null)
        ?.cloned_from_session_id,
    );
    if (fromId) oldToNew.set(fromId, r.id);
  }
} else {
  const { data: srcSessions } = await sb
    .from('sessions')
    .select('*')
    .eq('team_id', FROM_TEAM)
    .is('deleted_at', null);
  console.log(`step 4: cloning ${srcSessions?.length ?? 0} sessions to team ${TO_TEAM}`);
  for (const s of srcSessions ?? []) {
    const meta = {
      ...((s.metadata_json as Record<string, unknown> | null) ?? {}),
      cloned_from_session_id: s.id,
    };
    const insertRow = {
      team_id: TO_TEAM,
      type: s.type,
      label: s.label,
      template_id: s.template_id,
      video_links_json: s.video_links_json,
      metadata_json: meta,
      created_at: s.created_at,
    };
    if (APPLY) {
      const { data: inserted, error } = await sb
        .from('sessions')
        .insert(insertRow)
        .select('id')
        .single();
      if (error) throw new Error(`sessions clone failed for ${s.id}: ${error.message}`);
      oldToNew.set(s.id, inserted.id);
    } else {
      // dry-run: pretend we'd get a new id
      oldToNew.set(s.id, 0);
    }
  }
  console.log(`  cloned ${oldToNew.size} sessions`);
}

// 5. Re-point deliveries / responses for female players to the cloned
// session ids. Iterate per old_session because UPDATE ... SET
// session_id = (CASE …) gets gnarly via supabase-js.
let dShifted = 0;
let rShifted = 0;
for (const [oldId, newId] of oldToNew) {
  const { count: dCount } = await sb
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', oldId)
    .in('player_id', femaleIds);
  if (APPLY && (dCount ?? 0) > 0) {
    const { error } = await sb
      .from('deliveries')
      .update({ session_id: newId })
      .eq('session_id', oldId)
      .in('player_id', femaleIds);
    if (error) throw new Error(`deliveries update failed: ${error.message}`);
  }
  dShifted += dCount ?? 0;

  const { count: rCount } = await sb
    .from('responses')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', oldId)
    .in('player_id', femaleIds);
  if (APPLY && (rCount ?? 0) > 0) {
    const { error } = await sb
      .from('responses')
      .update({ session_id: newId })
      .eq('session_id', oldId)
      .in('player_id', femaleIds);
    if (error) throw new Error(`responses update failed: ${error.message}`);
  }
  rShifted += rCount ?? 0;
}
console.log(`step 5: deliveries re-pointed → ${dShifted} rows`);
console.log(`step 5: responses re-pointed → ${rShifted} rows`);

console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN COMPLETE'}.`);
if (!APPLY) {
  console.log('re-run with --apply to actually mutate the DB.');
}
