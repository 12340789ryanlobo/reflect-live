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

  // Render the wordmark unconditionally — animate via opacity + max-width
  // rather than mounting/unmounting, so collapsing the sidebar is a smooth
  // slide-and-fade instead of a pop.
  return (
    <span className={cn('inline-flex items-center', className)}>
      <Image
        src="/logo.png"
        alt=""
        width={dim}
        height={dim}
        priority
        className="select-none shrink-0"
      />
      <span
        className={cn(
          'font-bold tracking-tight leading-none whitespace-nowrap overflow-hidden transition-all duration-200 ease-out',
          textSize,
          showText ? 'opacity-100 max-w-[180px] ml-2' : 'opacity-0 max-w-0 ml-0',
        )}
        style={{ color: 'var(--blue)' }}
        aria-hidden={!showText}
      >
        Reflect
      </span>
    </span>
  );
}
