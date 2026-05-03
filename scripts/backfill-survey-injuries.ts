// Backfill injury_reports rows from paired Pain+body-area survey
// exchanges in twilio_messages. One-time + idempotent — safe to
// re-run; rows are upserted on source_sid (the inbound SID of the
// body-area reply).
//
// Usage:
//   bun run scripts/backfill-survey-injuries.ts [--dry-run] [--player <id>]

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { extractSurveyInjuries } from '../apps/web/src/lib/survey-injuries';

for (const line of readFileSync('apps/web/.env.local', 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const k = trimmed.slice(0, eq);
  let v = trimmed.slice(eq + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const DRY = process.argv.includes('--dry-run');
const playerArgIdx = process.argv.indexOf('--player');
const ONLY_PLAYER = playerArgIdx !== -1 ? Number(process.argv[playerArgIdx + 1]) : null;

interface Player {
  id: number;
  team_id: number;
  name: string;
}

const playerQ = sb.from('players').select('id,team_id,name');
const { data: players } = ONLY_PLAYER
  ? await playerQ.eq('id', ONLY_PLAYER)
  : await playerQ;

if (!players || players.length === 0) {
  console.log('no players matched');
  process.exit(1);
}

console.log(`processing ${players.length} player${players.length === 1 ? '' : 's'}${DRY ? ' (dry-run)' : ''}`);

let totalDerived = 0;
let totalUpserted = 0;
let totalSkippedExisting = 0;

for (const p of players as Player[]) {
  const { data: msgs } = await sb
    .from('twilio_messages')
    .select('sid,direction,body,date_sent,player_id,team_id')
    .eq('player_id', p.id)
    .order('date_sent', { ascending: true })
    .limit(2000);
  if (!msgs || msgs.length === 0) continue;
  const derived = extractSurveyInjuries(msgs, p.id, p.team_id);
  if (derived.length === 0) continue;
  totalDerived += derived.length;
  console.log(`\n  #${p.id} ${p.name}: ${derived.length} derived injuries`);

  // Filter out source_sids we've already inserted before, just so the
  // dry-run output is meaningful (the upsert path itself is also
  // idempotent via the unique index).
  const sids = derived.map((d) => d.source_sid);
  const { data: existing } = await sb
    .from('injury_reports')
    .select('source_sid')
    .in('source_sid', sids);
  const haveAlready = new Set((existing ?? []).map((r) => r.source_sid));
  const fresh = derived.filter((d) => !haveAlready.has(d.source_sid));
  totalSkippedExisting += derived.length - fresh.length;

  for (const d of fresh) {
    const sevText = d.regions.join(' / ') || 'unspecified';
    console.log(`    ${d.reported_at.slice(0, 10)} [${sevText}]  "${d.description.slice(0, 60)}"`);
  }

  if (DRY || fresh.length === 0) continue;

  const rows = fresh.map((d) => ({
    player_id: d.player_id,
    team_id: d.team_id,
    regions: d.regions,
    severity: null as number | null,
    description: d.description,
    reported_at: d.reported_at,
    resolved_at: null as string | null,
    reported_by: 'survey:auto',
    source_sid: d.source_sid,
  }));
  const { error } = await sb
    .from('injury_reports')
    .upsert(rows, { onConflict: 'source_sid' });
  if (error) {
    console.error(`  upsert failed for player #${p.id}: ${error.message}`);
    continue;
  }
  totalUpserted += rows.length;
}

console.log(`\nsummary:`);
console.log(`  derived (all):          ${totalDerived}`);
console.log(`  already in db (skipped): ${totalSkippedExisting}`);
console.log(`  upserted${DRY ? ' (would have)' : ''}:        ${DRY ? totalDerived - totalSkippedExisting : totalUpserted}`);
