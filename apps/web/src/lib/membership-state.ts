// Pure resolver: given the current user's TeamMembership rows, classify
// their state into one of three buckets that drive dashboard routing
// and the pending banner. No side effects; safe to call anywhere.

import type { TeamMembership } from '@reflect-live/shared';

export type MembershipState =
  | { kind: 'no_memberships' }
  | { kind: 'pending_only'; pending: TeamMembership[] }
  | {
      kind: 'active';
      active: TeamMembership[];
      activeTeamIds: number[];
      defaultTeamId: number;
      pending: TeamMembership[];
    };

export function resolveMembershipState(memberships: TeamMembership[]): MembershipState {
  const active = memberships.filter((m) => m.status === 'active');
  const pending = memberships.filter((m) => m.status === 'requested');

  if (active.length === 0) {
    if (pending.length > 0) return { kind: 'pending_only', pending };
    return { kind: 'no_memberships' };
  }

  // Pick the user's default team. Prefer the row flagged default_team=true;
  // otherwise the lowest team_id (deterministic; coach can correct via the
  // settings page once 1d ships).
  const flagged = active.find((m) => m.default_team);
  const defaultTeamId = flagged
    ? flagged.team_id
    : [...active].sort((a, b) => a.team_id - b.team_id)[0].team_id;

  return {
    kind: 'active',
    active,
    activeTeamIds: active.map((m) => m.team_id),
    defaultTeamId,
    pending,
  };
}
