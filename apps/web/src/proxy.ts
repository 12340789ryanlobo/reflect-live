import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher(['/dashboard(.*)', '/onboarding', '/api/(.*)']);

// Stripe webhooks (and any future server-to-server callbacks) don't
// carry Clerk session cookies — they authenticate via signed
// request bodies. Without this allow-list, Clerk's middleware
// rewrites them to /404 before our handler runs.
const isPublicApi = createRouteMatcher(['/api/billing/webhook']);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicApi(req)) return;
  if (isProtected(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
