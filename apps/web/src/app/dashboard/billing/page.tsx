'use client';

// In-app billing screen. Shows the team's current plan + the feature
// matrix and lets the coach kick off Stripe Checkout / Customer
// Portal. Real plan changes happen in the webhook handler — this UI
// just initiates the redirect.
//
// Falls back to 'free' if team.plan is undefined (migration not yet
// applied), so this page works in both states.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from '@/components/v3/pill';
import {
  PLANS,
  PLAN_ORDER,
  resolvePlan,
  type Plan,
  type PlanFeatures,
} from '@/lib/billing-plans';

interface FeatureRow {
  key: keyof PlanFeatures;
  label: string;
  detail?: string;
}

const FEATURE_ROWS: FeatureRow[] = [
  { key: 'coreDashboard',  label: 'Dashboard + activity feed' },
  { key: 'smsInbound',     label: 'Inbound SMS / WhatsApp tagging' },
  { key: 'scoreTrends',    label: 'Score trends per metric' },
  { key: 'scheduledSends', label: 'Scheduled surveys + reminders' },
  { key: 'bodyHeatmap',    label: 'Body-region pain heatmap' },
  { key: 'llmBriefings',   label: 'LLM athlete briefings' },
  { key: 'aiAssistant',    label: 'AI chat assistant' },
  { key: 'multiTeamAdmin', label: 'Multi-team admin pooling' },
  { key: 'prioritySupport',label: 'Priority email support' },
];

export default function BillingPage() {
  const { team } = useDashboard();
  const sb = useSupabase();
  const params = useSearchParams();
  const status = params.get('status');
  const intent = params.get('intent');
  const intentPlan = params.get('plan');
  const [planRaw, setPlanRaw] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [upgrading, setUpgrading] = useState<Plan | null>(null);
  const [upgradeErr, setUpgradeErr] = useState<string | null>(null);

  // useDashboard's `team` object may not include `plan` if the type
  // definition in @reflect-live/shared hasn't been bumped yet, so we
  // re-query the column directly. Falls back to 'free' on error.
  useEffect(() => {
    if (!team?.id) return;
    let alive = true;
    (async () => {
      const { data } = await sb.from('teams').select('plan').eq('id', team.id).maybeSingle<{ plan: string }>();
      if (!alive) return;
      setPlanRaw(data?.plan ?? null);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [sb, team?.id]);

  const plan: Plan = resolvePlan(planRaw);
  const planDef = PLANS[plan];

  // Kicks off Stripe Checkout for the given target plan. Server is the
  // authority on auth + plan validity; we just redirect to whatever
  // session URL it returns. The webhook is what actually flips
  // teams.plan, so the `?status=success` landing is purely visual —
  // the real plan change may be a few seconds behind on first arrival.
  async function startCheckout(target: Plan) {
    if (!team?.id) return;
    setUpgradeErr(null);
    setUpgrading(target);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ team_id: team.id, plan: target }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setUpgradeErr(json.error ?? 'checkout_failed');
        setUpgrading(null);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setUpgradeErr('network_error');
      setUpgrading(null);
    }
  }

  // Opens Stripe Customer Portal — phase-3 endpoint, but the button
  // is rendered here defensively (no-op until the route exists).
  async function openPortal() {
    if (!team?.id) return;
    setUpgradeErr(null);
    setUpgrading('team');  // reuse spinner state
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ team_id: team.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setUpgradeErr(json.error ?? 'portal_failed');
        setUpgrading(null);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setUpgradeErr('network_error');
      setUpgrading(null);
    }
  }

  // Auto-launch checkout when the user arrives from /pricing with
  // ?intent=upgrade&plan=team. We fire once and only on the free
  // tier — landing on this URL while already paid would be a no-op
  // (no Stripe Checkout for the plan they already have).
  useEffect(() => {
    if (!loaded || intent !== 'upgrade') return;
    if (planRaw && planRaw !== 'free') return;
    if (intentPlan !== 'team' && intentPlan !== 'program') return;
    if (upgrading) return;
    startCheckout(intentPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, intent, intentPlan, planRaw]);

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Billing"
        subtitle={`${team.name} · ${planDef.name} plan`}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {status === 'success' && (
          <div
            className="reveal rounded-xl border p-4 text-[13px]"
            style={{ borderColor: 'var(--green)', background: 'var(--green-soft)', color: 'var(--green)' }}
          >
            <strong>Subscription active.</strong> It may take a few seconds for the new plan to show below — refresh if needed.
          </div>
        )}
        {status === 'cancelled' && (
          <div
            className="reveal rounded-xl border p-4 text-[13px]"
            style={{ borderColor: 'var(--border)', background: 'var(--paper-2)', color: 'var(--ink-soft)' }}
          >
            Checkout cancelled. Your plan is unchanged.
          </div>
        )}
        {/* Current plan card */}
        <section
          className="reveal reveal-1 rounded-2xl border p-6 md:p-8"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
                Current plan
              </div>
              <div className="mt-1 flex items-center gap-3">
                <h2 className="text-2xl font-bold text-[color:var(--ink)]">{planDef.name}</h2>
                <Pill tone={plan === 'free' ? 'mute' : plan === 'team' ? 'blue' : 'green'}>
                  {plan === 'free' ? 'Free' : `$${planDef.pricePerSeason}/season`}
                </Pill>
              </div>
              <p className="mt-2 text-[13px] text-[color:var(--ink-soft)] max-w-[60ch]">
                {planDef.tagline}. {planDef.athleteLimit
                  ? `Up to ${planDef.athleteLimit} athletes.`
                  : 'Unlimited athletes & teams.'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {plan === 'free' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startCheckout('team')}
                    disabled={upgrading !== null}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                    style={{ background: 'var(--blue)' }}
                  >
                    {upgrading === 'team' ? 'Loading…' : 'Upgrade to Team →'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startCheckout('program')}
                    disabled={upgrading !== null}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition hover:opacity-90 disabled:opacity-60"
                    style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--border-2)' }}
                  >
                    {upgrading === 'program' ? 'Loading…' : 'Program →'}
                  </button>
                </div>
              )}
              {plan === 'team' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startCheckout('program')}
                    disabled={upgrading !== null}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                    style={{ background: 'var(--blue)' }}
                  >
                    {upgrading === 'program' ? 'Loading…' : 'Upgrade to Program →'}
                  </button>
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={upgrading !== null}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition hover:opacity-90 disabled:opacity-60"
                    style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--border-2)' }}
                  >
                    Manage subscription
                  </button>
                </div>
              )}
              {plan === 'program' && (
                <button
                  type="button"
                  onClick={openPortal}
                  disabled={upgrading !== null}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--border-2)' }}
                >
                  Manage subscription
                </button>
              )}
              {upgradeErr && (
                <span className="text-[10.5px]" style={{ color: 'var(--red)' }}>
                  {upgradeErr === 'forbidden' ? 'Only coaches can change billing.' : upgradeErr}
                </span>
              )}
              {!loaded && (
                <span className="text-[10.5px] text-[color:var(--ink-mute)]">loading…</span>
              )}
            </div>
          </div>
        </section>

        {/* Feature matrix */}
        <section
          className="reveal reveal-2 rounded-2xl border overflow-hidden"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <header
            className="px-6 py-4 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2 className="text-base font-bold text-[color:var(--ink)]">What's included</h2>
            <Link
              href="/pricing"
              className="text-[12px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition"
            >
              See all plans →
            </Link>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-6 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                    Feature
                  </th>
                  {PLAN_ORDER.map((p) => (
                    <th
                      key={p}
                      className="px-4 py-3 text-center text-[10.5px] font-semibold uppercase tracking-wide"
                      style={{ color: p === plan ? 'var(--ink)' : 'var(--ink-mute)' }}
                    >
                      {PLANS[p].name}
                      {p === plan && (
                        <span
                          className="ml-1.5 inline-block size-1.5 rounded-full align-middle"
                          style={{ background: 'var(--blue)' }}
                          aria-label="Your current plan"
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row) => (
                  <tr key={row.key} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-6 py-3 text-[color:var(--ink)]">{row.label}</td>
                    {PLAN_ORDER.map((p) => {
                      const has = PLANS[p].features[row.key];
                      return (
                        <td key={p} className="px-4 py-3 text-center">
                          {has ? (
                            <span style={{ color: 'var(--green)' }}>✓</span>
                          ) : (
                            <span style={{ color: 'var(--ink-dim)' }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Athlete-limit row */}
                <tr className="border-t-2" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-6 py-3 text-[color:var(--ink-mute)] text-[12px] font-semibold uppercase tracking-wide">
                    Athletes
                  </td>
                  {PLAN_ORDER.map((p) => (
                    <td key={p} className="px-4 py-3 text-center mono tabular text-[color:var(--ink-soft)]">
                      {PLANS[p].athleteLimit ?? '∞'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-[12px] text-[color:var(--ink-mute)] leading-relaxed">
          To change plans, email{' '}
          <a
            href="mailto:hello@reflect-live.app"
            className="text-[color:var(--blue)] hover:underline"
          >
            hello@reflect-live.app
          </a>
          . Self-serve plan management ships once we have a paying customer who needs it —
          for now every plan change is hand-confirmed so we can answer setup questions in
          the same thread.
        </p>
      </main>
    </>
  );
}
