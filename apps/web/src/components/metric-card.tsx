'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Sparkline } from './sparkline';

export type MetricTone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

const TONE_ACCENT: Record<MetricTone, string> = {
  default: 'bg-[hsl(188_72%_42%)]',
  primary: 'bg-[var(--maroon)]',
  success: 'bg-[var(--chlorine)]',
  warning: 'bg-[var(--amber)]',
  danger: 'bg-[var(--siren)]',
};

const TONE_SPARK: Record<MetricTone, { stroke: string; fill: string }> = {
  default: { stroke: 'hsl(192 80% 28%)', fill: 'hsl(188 72% 42%)' },
  primary: { stroke: 'hsl(358 66% 32%)', fill: 'hsl(358 66% 42%)' },
  success: { stroke: 'hsl(165 48% 38%)', fill: 'hsl(165 48% 46%)' },
  warning: { stroke: 'hsl(36 88% 44%)', fill: 'hsl(36 88% 54%)' },
  danger: { stroke: 'hsl(356 74% 48%)', fill: 'hsl(356 74% 58%)' },
};

export function Metric({
  label,
  value,
  sub,
  tone = 'default',
  icon,
  spark,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: MetricTone;
  icon?: React.ReactNode;
  spark?: number[];
}) {
  const t = TONE_SPARK[tone];
  return (
    <Card className="relative overflow-hidden p-5 gap-2">
      <span className={cn('absolute left-0 top-0 h-full w-[3px]', TONE_ACCENT[tone])} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow text-[0.62rem] tracking-[0.22em]">{label}</span>
        {icon && <span className="text-[var(--ink-mute)]">{icon}</span>}
      </div>
      <div
        key={String(value)}
        className="metric-value h-display tabular text-[2.15rem] font-semibold leading-none"
      >
        {value}
      </div>
      {spark && spark.length > 0 && (
        <div className="-mx-1 -mb-1 opacity-90">
          <Sparkline
            data={spark}
            width={140}
            height={24}
            stroke={t.stroke}
            fill={t.fill}
            strokeWidth={1.25}
            showDots
          />
        </div>
      )}
      {sub && <div className="mono text-[0.72rem] text-[var(--ink-mute)]">{sub}</div>}
    </Card>
  );
}
