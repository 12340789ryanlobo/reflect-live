// Small dashed-border upsell shown in place of a feature the team's
// plan doesn't include. Rendered when a gated endpoint replies 402
// with { required_plan }. Keeps the surface graceful — a quiet
// "upgrade to unlock" instead of a red error.

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { PLANS, type Plan } from '@/lib/billing-plans';

export function UpgradePrompt({
  feature,
  requiredPlan = 'team',
  className,
}: {
  /** Human label for the locked capability, e.g. "LLM briefings". */
  feature: string;
  requiredPlan?: Plan;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[12.5px] ${className ?? ''}`}
      style={{ borderColor: 'var(--border-2)', color: 'var(--ink-mute)' }}
    >
      <Lock className="size-3.5 shrink-0" />
      <span>
        {feature} {feature.endsWith('s') ? 'are' : 'is'} on the {PLANS[requiredPlan].name} plan.{' '}
        <Link href="/dashboard/billing" className="font-semibold underline" style={{ color: 'var(--blue)' }}>
          Upgrade
        </Link>
      </span>
    </div>
  );
}
