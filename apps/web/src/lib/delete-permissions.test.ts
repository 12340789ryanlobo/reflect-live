import { describe, it, expect } from 'vitest';
import { canDeleteActivityRow, type DeletePermissionContext } from './delete-permissions';

function ctx(overrides: Partial<DeletePermissionContext> = {}): DeletePermissionContext {
  return {
    pref: {
      role: 'athlete',
      team_id: 1,
      impersonate_player_id: 42,
      is_platform_admin: false,
    },
    rowPlayerId: 42,
    rowTeamId: 1,
    ...overrides,
  };
}

describe('canDeleteActivityRow', () => {
  it('allows the linked athlete to delete their own row', () => {
    expect(canDeleteActivityRow(ctx())).toBe(true);
  });

  it('forbids an athlete from deleting someone else\'s row', () => {
    expect(canDeleteActivityRow(ctx({ rowPlayerId: 99 }))).toBe(false);
  });

  it('allows a coach on the row\'s team to delete any row', () => {
    expect(
      canDeleteActivityRow(
        ctx({
          pref: { role: 'coach', team_id: 1, impersonate_player_id: null, is_platform_admin: false },
          rowPlayerId: 99,
          rowTeamId: 1,
        }),
      ),
    ).toBe(true);
  });

  it('forbids a coach from deleting a row on a different team', () => {
    expect(
      canDeleteActivityRow(
        ctx({
          pref: { role: 'coach', team_id: 1, impersonate_player_id: null, is_platform_admin: false },
          rowPlayerId: 99,
          rowTeamId: 2,
        }),
      ),
    ).toBe(false);
  });

  it('allows a platform admin to delete any row on any team', () => {
    expect(
      canDeleteActivityRow(
        ctx({
          pref: { role: null, team_id: null, impersonate_player_id: null, is_platform_admin: true },
          rowPlayerId: 99,
          rowTeamId: 999,
        }),
      ),
    ).toBe(true);
  });

  it('forbids a non-linked, non-coach user', () => {
    expect(
      canDeleteActivityRow(
        ctx({
          pref: { role: 'athlete', team_id: 1, impersonate_player_id: null, is_platform_admin: false },
        }),
      ),
    ).toBe(false);
  });

  it('forbids when pref is missing entirely', () => {
    expect(canDeleteActivityRow(ctx({ pref: null }))).toBe(false);
  });
});
