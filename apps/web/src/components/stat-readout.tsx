'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Sparkline } from './sparkline';

export type ReadoutTone = 'default' | 'signal' | 'heritage' | 'chlorine' | 'amber' | 'siren';

const TONE_COLOR: Record<ReadoutTone, string> = {
  default: 'hsl(36 10% 62%)',
  signal: 'hsl(188 82% 58%)',
  heritage: 'hsl(358 78% 58%)',
  chlorine: 'hsl(162 62% 54%)',
  amber: 'hsl(38 90% 62%)',
  siren: 'hsl(356 82% 62%)',
};

const TONE_SPARK: Record<ReadoutTone, { stroke: string; fill: string }> = {
  default: { stroke: 'hsl(36 10% 62%)', fill: 'hsl(36 10% 62%)' },
  signal: { stroke: 'hsl(188 82% 58%)', fill: 'hsl(188 82% 58%)' },
  heritage: { stroke: 'hsl(358 78% 58%)', fill: 'hsl(358 78% 58%)' },
  chlorine: { stroke: 'hsl(162 62% 54%)', fill: 'hsl(162 62% 54%)' },
  amber: { stroke: 'hsl(38 90% 62%)', fill: 'hsl(38 90% 62%)' },
  siren: { stroke: 'hsl(356 82% 62%)', fill: 'hsl(356 82% 62%)' },
};

/**
 * A clean, editorial stat readout. Reads like an almanac entry:
 * tiny eyebrow label (station-coded), oversized tabular display
 * number, optional mono subline, optional sparkline, optional
 * colored hairline at the top.
 *
 * Replaces the generic card-shaped metric. Deliberately flatter,
 * more paper-like. Stacks elegantly in a row of 3–6.
 */
export function StatReadout({
  code,
  label,
  value,
  sub,
  tone = 'default',
  spark,
  accent = true,
  className,
}: {
  code?: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: ReadoutTone;
  spark?: number[];
  accent?: boolean;
  className?: string;
}) {
  const color = TONE_COLOR[tone];
  const sparkTone = TONE_SPARK[tone];
  return (
    <div
      className={cn(
        'relative flex flex-col gap-1.5 border-l border-[color:var(--hairline)] pl-4 py-2',
        className,
      )}
    >
      {accent && (
        <span
          className="absolute left-0 top-2 h-3 w-[2px]"
          style={{ background: color }}
          aria-hidden
        />
      )}
      <div className="flex items-baseline gap-2">
        {code && <span className="station-code">{code}</span>}
        <span className="eyebrow">{label}</span>
      </div>
      <div
        key={String(value)}
        className="metric-value num-display text-[2.4rem] leading-none tracking-tight"
        style={{ color: tone === 'default' ? 'hsl(36 28% 94%)' : color }}
      >
        {value}
      </div>
      {spark && spark.length > 0 && (
        <div className="-ml-1 opacity-95">
          <Sparkline
            data={spark}
            width={120}
            height={22}
            stroke={sparkTone.stroke}
            fill={sparkTone.fill}
            strokeWidth={1.25}
            showDots
          />
        </div>
      )}
      {sub && <div className="mono text-[0.7rem] text-[color:var(--bone-mute)] tracking-wider">{sub}</div>}
    </div>
  );
}
