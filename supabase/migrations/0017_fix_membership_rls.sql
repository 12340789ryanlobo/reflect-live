-- Fix: drop the recursive memberships_team_managers_read policy.
--
-- The policy queried team_memberships itself to determine if the caller
-- was an active coach/captain on the row's team. Postgres's RLS
-- recursion guard returns no rows in that case, which broke the
-- dashboard-shell read of the user's own memberships.
--
-- The team-managers surface (the coach inbox at /dashboard/requests)
-- doesn't need RLS — it's served by the /api/teams/[id]/requests
-- endpoint which uses the service-role client and does its own auth
-- check. The remaining RLS policies — memberships_self_read +
-- memberships_platform_admin_read — cover what the client actually
-- needs to read directly.

drop policy if exists memberships_team_managers_read on team_memberships;
