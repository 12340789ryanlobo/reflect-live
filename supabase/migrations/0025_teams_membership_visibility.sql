-- Allow users to SELECT teams they have an active team_memberships row
-- on, in addition to the team currently linked via user_preferences.
--
-- Why: the TeamSwitcher in the sidebar lists every team the user is a
-- member of. Without this policy, a user with memberships on multiple
-- teams could only read the name of whichever team prefs.team_id was
-- pointing to — every other team in the dropdown showed as "team N"
-- because the browser-client query couldn't fetch its row.
--
-- The original "teams via prefs" policy stays in place so the existing
-- single-team-from-prefs path keeps working; we add a second policy
-- which OR's via PostgreSQL's permissive policy semantics.

DROP POLICY IF EXISTS "teams via memberships" ON teams;

CREATE POLICY "teams via memberships" ON teams
  FOR SELECT
  USING (
    id IN (
      SELECT team_id FROM team_memberships
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')
        AND status = 'active'
    )
  );
