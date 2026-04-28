import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The reflect wordmark — circular logomark + em-dash separator +
 * "reflect" wordmark. Matches the brand asset at /public/logo.png.
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
  const dim = size === 'sm' ? 24 : size === 'lg' ? 38 : 30;
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base';

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Image
        src="/logo.png"
        alt=""
        width={dim}
        height={dim}
        priority
        className="select-none"
      />
      {showText && (
        <span
          className={cn('font-bold tracking-tight leading-none', textSize)}
          style={{ color: 'var(--blue)' }}
        >
          Reflect
        </span>
      )}
    </span>
  );
}
