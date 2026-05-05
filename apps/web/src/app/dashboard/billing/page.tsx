'use client';

// In-app billing screen. Shows the team's current plan + the feature
// matrix + an upgrade CTA. Read-only — plan changes happen via
// /dashboard/admin/teams (admin sets it manually for pilots).
//
// Falls back to 'free' if team.plan is undefined (migration not yet
// applied), so this page works in both states.

import { useEffect, useState } from 'react';
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
  const [planRaw, setPlanRaw] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Billing"
        subtitle={`${team.name} · ${planDef.name} plan`}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
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
              {plan !== 'program' ? (
                <a
                  href={`mailto:hello@reflect-live.app?subject=Reflect%20upgrade%20—%20${team.name}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white transition hover:opacity-90"
                  style={{ background: 'var(--blue)' }}
                >
                  Upgrade plan →
                </a>
              ) : (
                <span className="text-[12px] text-[color:var(--ink-mute)]">
                  You're on the top tier.
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
