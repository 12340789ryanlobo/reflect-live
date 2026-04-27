import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'blue' | 'green' | 'amber' | 'red';

const TONE_COLOR: Record<StatTone, string> = {
  default: 'var(--ink)',
  blue: 'var(--blue)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  red: 'var(--red)',
};

/**
 * StatCell — uppercase label + big tabular value + optional sub line + optional trend chip.
 * Used in dashboard hero rows and admin overview pages.
 */
export function StatCell({
  label,
  value,
  sub,
  tone = 'default',
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
  trend?: { dir: 'up' | 'down' | 'flat'; text: string };
  className?: string;
}) {
  const valueColor = TONE_COLOR[tone];
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-[color:var(--ink-mute)]">
        {label}
      </div>
      <div
        className="text-[36px] font-bold leading-none tabular tracking-[-0.02em]"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      {trend && (
        <div className="mt-1">
          <span
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold rounded-md px-2 py-0.5"
            style={{
              color: trend.dir === 'up' ? 'var(--green)' : trend.dir === 'down' ? 'var(--red)' : 'var(--ink-mute)',
              background: trend.dir === 'up' ? 'var(--green-soft)' : trend.dir === 'down' ? 'var(--red-soft)' : 'var(--paper-2)',
            }}
          >
            {trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '→'} {trend.text}
          </span>
        </div>
      )}
      {sub && <div className="text-[12px] text-[color:var(--ink-mute)]">{sub}</div>}
    </div>
  );
}
