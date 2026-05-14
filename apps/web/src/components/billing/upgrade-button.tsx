'use client';

// Public-pricing-page CTA. Used in three states:
//   - Plan = 'free' (Starter): no checkout, sends visitor to /sign-up
//     so they can create a team and try the product immediately.
//   - Plan = 'team' | 'program': needs an active team_id. If the
//     visitor isn't signed in (checkout returns 401), we route to
//     /sign-in?next=/dashboard/billing so they land on the in-app
//     billing page where the team-aware upgrade button takes over.
//
// Keeping the routing fallback here means the pricing page itself
// can stay a server component — only this CTA needs auth state.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import type { Plan } from '@/lib/billing-plans';

interface Props {
  plan: Plan;
  label: string;
  highlighted: boolean;
}

export function UpgradeButton({ plan, label, highlighted }: Props) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [loading, setLoading] = useState(false);

  function onClick() {
    if (plan === 'free') {
      router.push('/sign-up');
      return;
    }
    setLoading(true);
    // We don't know the visitor's team_id from a server component, so
    // the public CTA always routes signed-in users through the
    // dashboard's billing page where useDashboard() supplies the
    // active team. Anyone signed-out lands at /sign-in first.
    if (!isLoaded) {
      // Clerk still warming up — fall through to dashboard which
      // will redirect to sign-in via middleware if needed.
    }
    if (isLoaded && !isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent('/dashboard/billing?intent=upgrade&plan=' + plan)}`);
      return;
    }
    router.push(`/dashboard/billing?intent=upgrade&plan=${plan}`);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="block w-full text-center px-5 py-3 rounded-xl text-[13px] font-bold transition hover:opacity-90 disabled:opacity-60"
      style={{
        background: highlighted ? 'var(--blue)' : 'var(--paper)',
        color: highlighted ? 'white' : 'var(--ink)',
        border: highlighted ? 'none' : '1px solid var(--border-2)',
      }}
    >
      {loading ? 'Loading…' : label}
    </button>
  );
}
