// Singleton Stripe SDK + small price-id lookup. Imported by every
// /api/billing/* route so they share one client and one
// authoritative way to resolve a Plan → Stripe price id.
//
// The SDK reads STRIPE_SECRET_KEY at construction. Routes that don't
// actually need Stripe should not import this module — we don't want
// to crash a request that has nothing to do with billing just because
// the key is missing in a preview env.

import Stripe from 'stripe';
import type { Plan } from '@/lib/billing-plans';

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  // No apiVersion pin: defaults to the SDK's bundled version so a
  // dependency bump doesn't silently switch us to a new API surface
  // mid-deploy. Stripe's webhook + Checkout API have been stable for
  // years so this is safe.
  return new Stripe(key);
}

// Map our internal Plan enum to the price IDs created in the Stripe
// Dashboard. Free is intentionally not mapped — the free plan never
// goes through Checkout.
export function priceIdForPlan(plan: Plan): string | null {
  if (plan === 'team') return process.env.STRIPE_PRICE_TEAM ?? null;
  if (plan === 'program') return process.env.STRIPE_PRICE_PROGRAM ?? null;
  return null;
}
