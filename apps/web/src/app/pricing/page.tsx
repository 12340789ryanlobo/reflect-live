// Public pricing page. Reads from lib/billing-plans.ts so the in-app
// billing screen, the admin plan flip, and this page stay in sync.
//
// Visual chrome matches the landing page (paper bg, blue accents,
// MagicCard hover spotlight on each tier so the page feels like part
// of the same product family).
//
// CTA on each card mailto's a sales address — no Stripe checkout yet,
// matches the stub-only billing layer.

import Link from 'next/link';
import { Brand } from '@/components/v3/brand';
import { MagicCard } from '@/components/ui/magic-card';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { PLANS, PLAN_ORDER, formatPrice, type Plan } from '@/lib/billing-plans';

export const dynamic = 'force-dynamic';

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[color:var(--paper)] text-[color:var(--ink)]">
      {/* Masthead — mirrors the landing-page header so visitors who
          click here from the marketing site land in the same chrome. */}
      <header className="border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-5 md:px-10">
          <Link href="/" className="hover:opacity-80 transition">
            <Brand size="md" />
          </Link>
          <Link
            href="/sign-in"
            className="text-[13px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--blue)] transition"
          >
            Sign in →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1280px] px-6 py-16 md:px-10 md:py-20 text-center reveal reveal-1">
        <p className="mb-3">
          <AnimatedShinyText className="text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--blue)]">
            Pricing
          </AnimatedShinyText>
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-[-0.02em] leading-[1.1] text-[color:var(--ink)] max-w-[20ch] mx-auto">
          Free for small teams. Cheap for everyone else.
        </h1>
        <p className="mt-5 max-w-[55ch] mx-auto text-[15px] text-[color:var(--ink-soft)] leading-relaxed">
          Annual subscription, billed once per season. No per-athlete metering,
          no usage caps within tier, no surprise overage bills. Upgrade or
          downgrade between seasons.
        </p>
      </section>

      {/* Tier grid */}
      <section className="mx-auto max-w-[1280px] px-6 pb-20 md:px-10 reveal reveal-2">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {PLAN_ORDER.map((id) => (
            <PricingCard key={id} planId={id} highlighted={id === 'team'} />
          ))}
        </div>
      </section>

      {/* FAQ-ish strip — just enough to head off the obvious questions. */}
      <section
        className="border-y"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <div className="mx-auto max-w-[1280px] px-6 py-16 md:px-10 grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-10">
          <FaqRow
            q="What happens at 13 athletes on the free tier?"
            a="Nothing breaks — the dashboard keeps working. We'll surface a soft prompt to upgrade once you cross the limit, but you stay live."
          />
          <FaqRow
            q="Mid-season upgrades?"
            a="Yes. Pro-rate by remaining months in the season. We invoice the difference; no card-on-file required for the first invoice."
          />
          <FaqRow
            q="Single team or whole athletic department?"
            a="Team plan covers one roster. Program plan covers as many teams as you have under one athletic department, with a single admin pane across all of them."
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-[920px] px-6 py-20 md:px-10 md:py-28 text-center">
        <h2 className="text-2xl md:text-4xl font-bold tracking-[-0.02em] text-[color:var(--ink)]">
          Want a pilot?
        </h2>
        <p className="mt-4 max-w-[50ch] mx-auto text-[14px] text-[color:var(--ink-mute)]">
          We'll set up a free 30-day trial of the Team plan, get your roster onboarded,
          and check back at the end of the month to see if it's working.
        </p>
        <div className="mt-8">
          <a
            href="mailto:hello@reflect-live.app?subject=Reflect%20pilot%20interest"
            className="inline-flex items-center gap-2 px-7 py-4 rounded-xl text-[14px] font-bold text-white transition hover:opacity-90"
            style={{ background: 'var(--blue)' }}
          >
            Request a pilot
            <span aria-hidden>→</span>
          </a>
        </div>
      </section>

      {/* Colophon — match landing page */}
      <footer className="border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-6 md:px-10 text-[12px] text-[color:var(--ink-mute)]">
          <Brand size="sm" />
          <span>Designed &amp; built by Ryan Lobo</span>
        </div>
      </footer>
    </main>
  );
}

function PricingCard({ planId, highlighted }: { planId: Plan; highlighted: boolean }) {
  const plan = PLANS[planId];
  return (
    <MagicCard
      className="rounded-2xl"
      gradientColor="var(--blue-soft)"
      gradientOpacity={0.55}
      gradientFrom="#1F5FB0"
      gradientTo="#3F7AC4"
    >
      <article
        className="p-7 flex flex-col h-full"
        style={{
          // Subtle ring + shadow on the recommended tier so the eye
          // lands there first. Same trick the landing page uses on
          // the dashboard preview.
          boxShadow: highlighted ? `0 0 0 1px var(--blue), 0 12px 32px -8px rgba(31,95,176,0.2)` : undefined,
        }}
      >
        <header className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="text-[18px] font-bold text-[color:var(--ink)]">{plan.name}</h2>
          {highlighted && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded text-white"
              style={{ background: 'var(--blue)' }}
            >
              Most popular
            </span>
          )}
        </header>
        <p className="text-[12.5px] text-[color:var(--ink-mute)] mb-5">{plan.tagline}</p>

        <div className="mb-1 flex items-baseline gap-1">
          <span className="text-[2.5rem] font-bold tabular leading-none text-[color:var(--ink)]">
            {plan.pricePerSeason === 0 ? 'Free' : `$${plan.pricePerSeason.toLocaleString()}`}
          </span>
          {plan.pricePerSeason > 0 && (
            <span className="text-[13px] text-[color:var(--ink-mute)]">/ season</span>
          )}
        </div>
        {plan.pricePerSeason > 0 && (
          <p className="text-[11.5px] text-[color:var(--ink-mute)] mb-5 mono tabular">
            ≈ ${plan.pricePerMonth} / month, billed annually
          </p>
        )}
        {plan.pricePerSeason === 0 && (
          <p className="text-[11.5px] text-[color:var(--ink-mute)] mb-5 mono tabular">
            forever — no card needed
          </p>
        )}

        <p className="text-[12px] text-[color:var(--ink-soft)] mb-5 leading-relaxed">
          <span className="font-semibold text-[color:var(--ink)]">Best for </span>
          {plan.bestFor}
        </p>

        <ul className="space-y-2.5 mb-7 text-[13px] text-[color:var(--ink-soft)] flex-1">
          {plan.highlights.map((h) => (
            <li key={h} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 size-1.5 rounded-full shrink-0"
                style={{ background: highlighted ? 'var(--blue)' : 'var(--ink-mute)' }}
                aria-hidden
              />
              <span>{h}</span>
            </li>
          ))}
        </ul>

        <a
          href={`mailto:hello@reflect-live.app?subject=Reflect%20${plan.name}%20plan`}
          className="block text-center px-5 py-3 rounded-xl text-[13px] font-bold transition hover:opacity-90"
          style={{
            background: highlighted ? 'var(--blue)' : 'var(--paper)',
            color: highlighted ? 'white' : 'var(--ink)',
            border: highlighted ? 'none' : '1px solid var(--border-2)',
          }}
        >
          {plan.pricePerSeason === 0 ? 'Get started free' : `Choose ${plan.name}`}
        </a>
      </article>
    </MagicCard>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  return (
    <article>
      <h3 className="text-[14px] font-bold text-[color:var(--ink)] mb-2">{q}</h3>
      <p className="text-[13px] text-[color:var(--ink-soft)] leading-relaxed">{a}</p>
    </article>
  );
}

export const metadata = {
  title: 'Pricing — Reflect',
  description: 'Annual subscription tiers for collegiate athlete-wellness monitoring. Free for small teams.',
};
