import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher(['/dashboard(.*)', '/onboarding', '/api/(.*)']);

// Stripe webhooks (and any future server-to-server callbacks) don't
// carry Clerk session cookies — they authenticate via signed
// request bodies. Without this allow-list, Clerk's middleware
// rewrites them to /404 before our handler runs.
//
// /api/teams/[id]/allowed-kinds is read by the reflect FastAPI webhook
// (server-to-server from Railway) to resolve the per-team SMS prefix
// allow-list. The data is non-sensitive (it's the same kind names the
// leaderboard already exposes to team members), so no auth is needed.
const isPublicApi = createRouteMatcher([
  '/api/billing/webhook',
  '/api/teams/(.*)/allowed-kinds',
  '/api/sms-bridge/allowed-kinds',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicApi(req)) return;
  if (isProtected(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
