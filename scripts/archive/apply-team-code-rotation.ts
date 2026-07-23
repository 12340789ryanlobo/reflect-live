// Rotate teams.code for team 1 (Men's) and team 7 (Women's) to fresh
// 6-char unguessable codes from the standard generator. Existing users
// are unaffected — memberships join via team_id, not code; the only
// thing that breaks is any old `?code=…` join URL the coach previously
// sent out.
//
// Usage:
//   bun run scripts/apply-team-code-rotation.ts            # dry-run
//   bun run scripts/apply-team-code-rotation.ts --apply    # writes

import { generateTeamCode } from '@reflect-live/shared';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('apps/web/.env.local', 'utf8');
const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))![1].trim();
const sb = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

const APPLY = process.argv.includes('--apply');
const TEAMS_TO_ROTATE = [1, 7];

console.log(`=== team-code rotation (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateTeamCode();
    const { data: clash } = await sb.from('teams').select('id').eq('code', code).maybeSingle();
    if (!clash) return code;
  }
  throw new Error('could not generate unique code after 8 tries');
}

for (const id of TEAMS_TO_ROTATE) {
  const { data: t } = await sb.from('teams').select('id,name,code').eq('id', id).maybeSingle();
  if (!t) {
    console.log(`  team ${id}: not found — skipping`);
    continue;
  }
  const next = await uniqueCode();
  if (APPLY) {
    const { error } = await sb.from('teams').update({ code: next }).eq('id', id);
    if (error) throw new Error(`team ${id} update: ${error.message}`);
  }
  console.log(`  team ${id} (${t.name})`);
  console.log(`    ${t.code}  →  ${next}`);
}

console.log(`\n${APPLY ? 'APPLIED.' : 'dry-run only — re-run with --apply to write.'}`);
