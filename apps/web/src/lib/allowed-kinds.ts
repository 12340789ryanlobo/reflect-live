// Computes the activity-log kinds a team may log right now: the baseline
// {workout, rehab} unioned with the scoring-map keys of every currently-active
// competition (today between starts_at and ends_at, not archived). Coaches edit
// competition scoring in the dashboard; new kinds become loggable without a
// redeploy. Shared by the allowed-kinds GET routes, the log-activity dialog,
// and the activity-logs POST validator so they never drift apart.

import type { SupabaseClient } from '@supabase/supabase-js';

export const BASELINE_KINDS = ['workout', 'rehab'] as const;

// A kind is a short lowercase slug — same rule the reflect webhook enforces.
export const KIND_RE = /^[a-z][a-z0-9_-]{0,31}$/;

export async function computeAllowedKinds(
  sb: SupabaseClient,
  teamId: number,
): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from('competitions')
    .select('scoring')
    .eq('team_id', teamId)
    .is('archived_at', null)
    .lte('starts_at', today)
    .gte('ends_at', today);
  if (error) throw error;

  const extras = new Set<string>();
  for (const row of (data ?? []) as Array<{ scoring: Record<string, unknown> | null }>) {
    for (const key of Object.keys(row.scoring ?? {})) {
      const k = key.trim().toLowerCase();
      if (KIND_RE.test(k) && !BASELINE_KINDS.includes(k as (typeof BASELINE_KINDS)[number])) {
        extras.add(k);
      }
    }
  }
  // Baseline kinds lead (workout first — the common default), then any
  // competition-specific kinds alphabetically. Stable, predictable order.
  return [...BASELINE_KINDS, ...[...extras].sort()];
}
