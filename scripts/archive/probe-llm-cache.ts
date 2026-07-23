// Quick check: does the llm_cache table exist in Supabase?
// Run: bun run scripts/probe-llm-cache.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('apps/web/.env.local', 'utf8');
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
if (!url || !key) {
  console.error('Missing supabase env vars in apps/web/.env.local');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { error, count } = await sb
  .from('llm_cache')
  .select('*', { count: 'exact', head: true });

if (error) {
  console.error('llm_cache lookup failed:', error.message);
  if (error.message.includes('relation') || error.message.includes('does not exist')) {
    console.error('\n→ Migration 0018_llm_cache.sql has NOT been applied yet.');
    console.error('  Run it in Supabase SQL Editor.');
  }
  process.exit(1);
}

console.log(`llm_cache exists. ${count ?? 0} cached row(s).`);
