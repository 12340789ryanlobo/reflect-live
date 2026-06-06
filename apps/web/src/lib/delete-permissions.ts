// Shared permission check for soft-deleting activity rows
// (activity_logs entries and self-report sessions).
//
// Two policies grant delete:
//   - Athlete deleting their own row: pref.impersonate_player_id matches
//     the row's player_id. Works for athlete + captain roles that have
//     impersonate set up.
//   - Coach / admin / platform_admin deleting any row on the row's team:
//     pref.team_id matches the row's team_id (platform admins bypass the
//     team match).

export interface DeletePermissionContext {
  pref: {
    role: string | null;
    team_id: number | null;
    impersonate_player_id: number | null;
    is_platform_admin: boolean | null;
  } | null;
  rowPlayerId: number;
  rowTeamId: number;
}

export function canDeleteActivityRow(ctx: DeletePermissionContext): boolean {
  if (!ctx.pref) return false;

  if (ctx.pref.is_platform_admin === true) return true;

  if (ctx.pref.impersonate_player_id === ctx.rowPlayerId) return true;

  const isCoach = ctx.pref.role === 'coach' || ctx.pref.role === 'admin';
  if (isCoach && ctx.pref.team_id === ctx.rowTeamId) return true;

  return false;
}
