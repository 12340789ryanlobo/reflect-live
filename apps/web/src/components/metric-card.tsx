'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Sparkline } from './sparkline';

export type MetricTone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

const TONE_ACCENT: Record<MetricTone, string> = {
  default: 'bg-border',
  primary: 'bg-primary',
  success: 'bg-[hsl(145_55%_32%)]',
  warning: 'bg-[hsl(38_85%_45%)]',
  danger: 'bg-destructive',
};

const TONE_SPARK: Record<MetricTone, { stroke: string; fill: string }> = {
  default: { stroke: 'hsl(20 15% 45%)', fill: 'hsl(20 15% 60%)' },
  primary: { stroke: 'hsl(0 100% 30%)', fill: 'hsl(0 100% 35%)' },
  success: { stroke: 'hsl(145 55% 32%)', fill: 'hsl(145 55% 40%)' },
  warning: { stroke: 'hsl(38 85% 42%)', fill: 'hsl(38 85% 50%)' },
  danger: { stroke: 'hsl(0 75% 45%)', fill: 'hsl(0 75% 55%)' },
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
      <span className={cn('absolute left-0 top-0 h-full w-1', TONE_ACCENT[tone])} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div
        key={String(value)}
        className="metric-value h-serif tabular text-3xl font-semibold leading-tight tracking-tight"
      >
        {value}
      </div>
      {spark && spark.length > 0 && (
        <div className="-mx-1 -mb-1 opacity-85">
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
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
