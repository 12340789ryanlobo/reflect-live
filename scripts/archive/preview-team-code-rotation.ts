// Read-only preview: shows what `generateTeamCode()` would produce for
// both teams. No DB writes. To actually rotate the codes, create a
// follow-up apply script after the user confirms.
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

const { data: teams } = await sb
  .from('teams')
  .select('id,name,code')
  .in('id', [1, 7])
  .order('id');

console.log('=== TEAM CODE ROTATION PREVIEW (no writes) ===\n');
for (const t of teams ?? []) {
  console.log(`  team ${t.id} — ${t.name}`);
  console.log(`    current: ${t.code}`);
  console.log(`    proposed: ${generateTeamCode()}`);
  console.log();
}
console.log('To apply, create scripts/apply-team-code-rotation.ts after confirming.');
