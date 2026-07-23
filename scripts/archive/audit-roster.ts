// List every player on team 1 and team 7 with gender + group, plus
// players with NULL gender that might be miscategorised.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('apps/web/.env.local', 'utf8');
const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))![1].trim();
const sb = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

const { data: all } = await sb
  .from('players')
  .select('id,name,gender,group,team_id,phone_e164,active')
  .in('team_id', [1, 7])
  .order('team_id')
  .order('name');

console.log('=== team 1 (men) ===');
const team1 = (all ?? []).filter((p) => p.team_id === 1);
const by1Gender: Record<string, number> = {};
for (const p of team1) by1Gender[String(p.gender)] = (by1Gender[String(p.gender)] ?? 0) + 1;
console.log(`total: ${team1.length}  by gender:`, by1Gender);
for (const p of team1) console.log(`  #${p.id} ${p.name.padEnd(28)} gender=${p.gender} group=${p.group} active=${p.active}`);

console.log('\n=== team 7 (women) ===');
const team7 = (all ?? []).filter((p) => p.team_id === 7);
const by7Gender: Record<string, number> = {};
for (const p of team7) by7Gender[String(p.gender)] = (by7Gender[String(p.gender)] ?? 0) + 1;
console.log(`total: ${team7.length}  by gender:`, by7Gender);
for (const p of team7) console.log(`  #${p.id} ${p.name.padEnd(28)} gender=${p.gender} group=${p.group} active=${p.active}`);

// Anyone with NULL gender?
const nullGender = (all ?? []).filter((p) => p.gender == null);
console.log(`\nplayers with NULL gender: ${nullGender.length}`);
for (const p of nullGender) console.log(`  #${p.id} ${p.name} (team ${p.team_id})`);
