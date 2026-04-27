import { cn } from '@/lib/utils';

/**
 * The reflect wordmark — blue square with white "R" + "reflect" in Montserrat.
 * Used in the sidebar, landing masthead, and auth split panels.
 */
export function Brand({
  className,
  size = 'md',
  showText = true,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}) {
  const dim = size === 'sm' ? 24 : size === 'lg' ? 36 : 30;
  const fontSize = size === 'sm' ? '0.6rem' : size === 'lg' ? '0.85rem' : '0.78rem';
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className="grid place-items-center rounded-md font-bold text-white"
        style={{
          width: dim,
          height: dim,
          background: 'var(--blue)',
          fontSize,
          letterSpacing: '-0.02em',
        }}
      >
        R
      </span>
      {showText && (
        <span
          className={cn('font-semibold tracking-tight text-[color:var(--ink)]', textSize)}
        >
          reflect
        </span>
      )}
    </span>
  );
}
