import { cn } from '@/lib/utils';
import { BrandMark } from './brand-mark';

/**
 * The reflect wordmark — circle-with-ripple logomark + "reflect" in
 * Montserrat. Used in the sidebar, landing masthead, and auth split
 * panels. The mark inherits color via `currentColor`, set on the
 * wrapper.
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
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span style={{ color: 'var(--blue)' }} className="inline-flex">
        <BrandMark size={dim} />
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
