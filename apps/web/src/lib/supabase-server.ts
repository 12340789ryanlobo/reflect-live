import { createClient } from '@supabase/supabase-js';

// Service-role Supabase client for server-only code (API routes, server
// guards). Bypasses RLS, so it must never be imported from a client
// component. Sessions aren't persisted — each server request is stateless.
export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
