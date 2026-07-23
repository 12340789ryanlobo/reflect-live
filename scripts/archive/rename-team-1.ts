// One-shot: rename UChicago Swim & Dive (team_id=1) to its men's-team
// identity in preparation for a women's-team split. Also flip
// default_gender to 'male' so the team-wide body-heatmap renders the
// male silhouette by default.
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
const NEW_NAME = "UChicago Men's Swim & Dive";

const { data: before } = await sb
  .from('teams')
  .select('id,name,default_gender,team_code')
  .eq('id', TEAM_ID)
  .single();
console.log('before:', before);

const { error } = await sb
  .from('teams')
  .update({ name: NEW_NAME, default_gender: 'male' })
  .eq('id', TEAM_ID);
if (error) {
  console.error('update failed:', error.message);
  process.exit(1);
}

const { data: after } = await sb
  .from('teams')
  .select('id,name,default_gender,team_code')
  .eq('id', TEAM_ID)
  .single();
console.log('after: ', after);
