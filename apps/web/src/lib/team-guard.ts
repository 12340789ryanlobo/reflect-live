// Server-side authorization helper.
//
// Resolves the caller's *effective* role on a specific team from the live
// source of truth — team_memberships — rather than user_preferences.role.
// prefs.role is client-influenced and goes stale when a membership is removed,
// which is exactly how the routes that trusted it became a cross-team
// escalation surface. Platform admins (is_platform_admin) resolve to 'admin'
// on every team.
//
// Returns the highest-privilege active membership role on `teamId`, 'admin'
// for platform admins, or null when the user has no active membership there.

import type { SupabaseClient } from '@supabase/supabase-js';

export type EffectiveRole = 'admin' | 'coach' | 'captain' | 'athlete';

export async function resolveTeamRole(
  sb: SupabaseClient,
  userId: string,
  teamId: number,
): Promise<EffectiveRole | null> {
  const { data: pref } = await sb
    .from('user_preferences')
    .select('is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean }>();
  if (pref?.is_platform_admin === true) return 'admin';

  // A user can legitimately hold more than one membership row for a team over
  // its history; fetch all active ones and take the highest privilege (never
  // .maybeSingle here — multiple rows would 500).
  const { data: mems } = await sb
    .from('team_memberships')
    .select('role')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .eq('status', 'active');
  const roles = (mems ?? []).map((m) => (m as { role: string }).role);
  if (roles.includes('coach')) return 'coach';
  if (roles.includes('captain')) return 'captain';
  if (roles.includes('athlete')) return 'athlete';
  return null;
}
