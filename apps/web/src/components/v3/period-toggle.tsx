'use client';

// Reusable rolling-window picker — used anywhere a page slices data
// by date (player summaries, sessions list, activity log, etc.).
// Default options are 7d / 14d / 30d / All; pass `options` to override.

import type { Period } from '@/lib/period';
import { periodShortLabel } from '@/lib/period';

interface Props {
  value: Period;
  onChange: (p: Period) => void;
  options?: readonly Period[];
  disabled?: boolean;
  className?: string;
}

const DEFAULT_OPTIONS: readonly Period[] = [7, 14, 30, 'all'] as const;

export function PeriodToggle({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  disabled = false,
  className = '',
}: Props) {
  return (
    <div
      className={`inline-flex rounded-md border overflow-hidden ${className}`}
      style={{ borderColor: 'var(--border)' }}
      role="radiogroup"
      aria-label="Time window"
    >
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={String(opt)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
              active
                ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                : 'text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]'
            }`}
            disabled={disabled}
          >
            {periodShortLabel(opt)}
          </button>
        );
      })}
    </div>
  );
}
