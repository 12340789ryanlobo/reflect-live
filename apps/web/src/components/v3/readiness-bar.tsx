import { cn } from '@/lib/utils';

/**
 * Horizontal readiness gauge 0–10. Replaces the SVG dial.
 * Color shifts by value: <4 red, 4–6 amber, ≥6 green.
 * Big tabular value above the bar; thin scale labels below.
 */
export function ReadinessBar({
  value,
  max = 10,
  responses,
  flagged,
  size = 'md',
  className,
}: {
  value: number | null;
  max?: number;
  responses?: number;
  flagged?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const tone =
    value == null
      ? { color: 'var(--ink-dim)', label: 'No data' }
      : value < 4
      ? { color: 'var(--red)', label: 'Flag' }
      : value < 6
      ? { color: 'var(--amber)', label: 'Watch' }
      : { color: 'var(--green)', label: 'Healthy' };

  const fillPct = value == null ? 0 : Math.min(100, (value / max) * 100);
  const valueSize = size === 'sm' ? 'text-3xl' : size === 'lg' ? 'text-6xl' : 'text-5xl';
  const barHeight = size === 'sm' ? 6 : size === 'lg' ? 12 : 10;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between">
        <div>
          <div
            className="text-[11.5px] font-semibold uppercase tracking-[0.5px]"
            style={{ color: tone.color }}
          >
            Team readiness
          </div>
          <div className={cn('font-bold tabular leading-none mt-2', valueSize)} style={{ color: tone.color }}>
            {value != null ? value.toFixed(1) : '—'}
            <span className="text-base text-[color:var(--ink-mute)] font-medium ml-1">/ {max}</span>
          </div>
        </div>
        {flagged != null && flagged > 0 && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold"
            style={{ color: 'var(--red)', background: 'var(--red-soft)' }}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {flagged} flag{flagged === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div
        className="w-full overflow-hidden rounded-full"
        style={{ height: barHeight, background: 'var(--border)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${fillPct}%`, background: tone.color }}
        />
      </div>

      <div className="flex justify-between text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
        <span>0</span>
        <span>{tone.label}</span>
        <span>{responses != null ? `${responses} responses` : ''}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
