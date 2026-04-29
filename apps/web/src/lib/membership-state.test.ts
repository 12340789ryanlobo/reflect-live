import { describe, it, expect } from 'vitest';
import { resolveMembershipState } from './membership-state';
import type { TeamMembership } from '@reflect-live/shared';

function mk(partial: Partial<TeamMembership>): TeamMembership {
  return {
    clerk_user_id: 'u1',
    team_id: 1,
    player_id: null,
    role: 'athlete',
    status: 'active',
    default_team: false,
    requested_name: null,
    requested_email: null,
    requested_phone: null,
    requested_at: '2026-04-29T00:00:00Z',
    decided_at: null,
    decided_by: null,
    deny_reason: null,
    ...partial,
  };
}

describe('resolveMembershipState', () => {
  it('returns no_memberships for an empty array', () => {
    expect(resolveMembershipState([])).toEqual({ kind: 'no_memberships' });
  });

  it('returns pending_only when only requested rows exist', () => {
    const r = resolveMembershipState([mk({ status: 'requested', team_id: 1 })]);
    expect(r.kind).toBe('pending_only');
    if (r.kind === 'pending_only') expect(r.pending).toHaveLength(1);
  });

  it('returns active when at least one membership is active', () => {
    const r = resolveMembershipState([
      mk({ status: 'active', team_id: 1, default_team: true }),
      mk({ status: 'requested', team_id: 2 }),
    ]);
    expect(r.kind).toBe('active');
    if (r.kind === 'active') {
      expect(r.activeTeamIds).toEqual([1]);
      expect(r.defaultTeamId).toBe(1);
      expect(r.pending).toHaveLength(1);
    }
  });

  it('falls back to first active team alphabetically if no default flagged', () => {
    const r = resolveMembershipState([
      mk({ status: 'active', team_id: 5, default_team: false }),
      mk({ status: 'active', team_id: 2, default_team: false }),
    ]);
    expect(r.kind).toBe('active');
    if (r.kind === 'active') {
      // Numerically lowest team_id stands in for "alphabetically first" when
      // we don't have team names — simple, deterministic, and correctable
      // by a coach who flips default_team.
      expect(r.defaultTeamId).toBe(2);
    }
  });

  it('treats denied / left / removed as not blocking — pending_only if no active', () => {
    const r = resolveMembershipState([
      mk({ status: 'denied', team_id: 1 }),
      mk({ status: 'left', team_id: 2 }),
    ]);
    expect(r.kind).toBe('no_memberships');
  });

  it('ignores invited rows for the kind (sub-4 will surface them separately)', () => {
    const r = resolveMembershipState([mk({ status: 'invited', team_id: 1 })]);
    expect(r.kind).toBe('no_memberships');
  });
});
