// POST /api/billing/portal
//
// Body: { team_id: number }
//
// Returns { url } pointing at a Stripe Customer Portal session for
// the team. The portal handles plan switching, payment-method
// updates, invoice history, and cancellation — everything the coach
// needs to manage their subscription without us building UI for it.
//
// Requires the team to already have a Stripe Customer (i.e. has
// gone through Checkout at least once). Free teams that never paid
// get a 400 — they should go through /api/billing/checkout instead.

import { NextResponse } from 'next/server';
import { requireBillingActor } from '@/lib/billing-guard';
import { getStripe } from '@/lib/stripe';

export async function POST(req: Request) {
  let body: { team_id?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const teamId = Number(body.team_id);

  const gate = await requireBillingActor(teamId);
  if (!gate.ok) return gate.response;
  const { team } = gate;

  if (!team.stripe_customer_id) {
    return NextResponse.json({ error: 'no_stripe_customer' }, { status: 400 });
  }

  const stripe = getStripe();
  const origin = new URL(req.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: team.stripe_customer_id,
    return_url: `${origin}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url });
}

export const dynamic = 'force-dynamic';
