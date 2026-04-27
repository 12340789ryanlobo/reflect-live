import { cn } from '@/lib/utils';

export interface TrendDay {
  day: string;        // short label like "Mon" or "Apr 18"
  value: number | null; // average readiness 0-10, null if no data
  count: number;      // # of responses contributing to value (for tooltip)
}

/**
 * 7-day readiness trend bar chart. Bar height encodes value 0-10. Color encodes severity.
 */
export function TrendChart({
  data,
  className,
}: {
  data: TrendDay[];
  className?: string;
}) {
  const max = 10;
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-end gap-2 h-40">
        {data.map((d, i) => {
          const height = d.value == null ? 0 : (d.value / max) * 100;
          const color =
            d.value == null
              ? 'var(--ink-dim)'
              : d.value < 4
              ? 'var(--red)'
              : d.value < 6
              ? 'var(--amber)'
              : 'var(--green)';
          return (
            <div key={i} className="flex-1 flex flex-col justify-end items-center gap-1">
              <div className="text-[11px] font-semibold tabular text-[color:var(--ink)]">
                {d.value != null ? d.value.toFixed(1) : '—'}
              </div>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${Math.max(height, d.value != null ? 4 : 1)}%`,
                  background: color,
                  minHeight: d.value != null ? 4 : 2,
                }}
                title={`${d.day}: ${d.count} responses`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 text-[11px] text-center font-medium uppercase tracking-wide text-[color:var(--ink-mute)]"
          >
            {d.day}
          </div>
        ))}
      </div>
    </div>
  );
}
