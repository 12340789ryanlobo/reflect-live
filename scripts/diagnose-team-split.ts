// Read-only audit: figure out exactly what a team-split migration
// for UChicago Swim & Dive (team_id=1) would touch.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('apps/web/.env.local', 'utf8');
const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))![1].trim();
const sb = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

const TEAM_ID = 1;
const { data: ps } = await sb
  .from('players')
  .select('id,name,gender,group')
  .eq('team_id', TEAM_ID)
  .order('id');
const counts: Record<string, number> = { male: 0, female: 0, null: 0 };
const sample: Record<string, string[]> = { male: [], female: [], null: [] };
for (const p of ps ?? []) {
  const g = p.gender ?? 'null';
  counts[g] = (counts[g] ?? 0) + 1;
  if (sample[g].length < 5) sample[g].push(`#${p.id} ${p.name}`);
}
console.log(`Team ${TEAM_ID} player gender breakdown:`, counts);
console.log(`total players: ${ps?.length ?? 0}\n`);
for (const g of ['male', 'female', 'null']) {
  console.log(`${g} sample:`);
  for (const s of sample[g]) console.log('  ', s);
  console.log();
}

// Cross-check: anywhere player.team_id is referenced
for (const t of ['twilio_messages', 'activity_logs', 'injury_reports', 'team_memberships', 'sessions', 'deliveries', 'responses']) {
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID);
  console.log(`${t}.team_id=${TEAM_ID}  rows: ${count}`);
}
