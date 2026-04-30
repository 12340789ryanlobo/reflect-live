// Drops cached rules-based summaries so the next click retries the LLM.
// Useful after a rate-limit window or model swap.
//   bun run scripts/clear-llm-cache-rules.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('apps/web/.env.local', 'utf8');
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
if (!url || !key) {
  console.error('Missing supabase env vars');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const { count: before } = await sb.from('llm_cache').select('*', { count: 'exact', head: true });
const { error } = await sb.from('llm_cache').delete().eq('generated_by', 'rules');
if (error) { console.error(error); process.exit(1); }
const { count: after } = await sb.from('llm_cache').select('*', { count: 'exact', head: true });
console.log(`Cleared rules-based cache rows: ${before} → ${after}`);
