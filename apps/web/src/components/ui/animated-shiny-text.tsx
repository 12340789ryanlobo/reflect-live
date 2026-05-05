// A horizontal shimmer that pans across text. Adapted from magicui's
// pattern but rebuilt around a wider gradient so the effect actually
// reads on a light background — the upstream `from-transparent via-X
// to-transparent` band sits on top of the existing text color and
// barely shows over a muted eyebrow on cream paper.
//
// This version uses `bg-clip-text + text-transparent` so the gradient
// IS the text. The gradient is sized 200% wide and animated from
// 200% → -200% over `--shimmer-duration`, so the glint sweeps across
// the visible width once per cycle. Base color stays solid (no
// 'invisible' regions) so the text never disappears.

import { type ComponentPropsWithoutRef, type CSSProperties, type FC } from 'react';
import { cn } from '@/lib/utils';

export interface AnimatedShinyTextProps extends ComponentPropsWithoutRef<'span'> {
  /** CSS duration. Slower = calmer. Default 6s. */
  duration?: string;
  /** Base text color. CSS color or var(). */
  baseColor?: string;
  /** Glint color — the brighter band that sweeps across. */
  glintColor?: string;
}

export const AnimatedShinyText: FC<AnimatedShinyTextProps> = ({
  children,
  className,
  duration = '6s',
  baseColor = 'var(--blue)',
  glintColor = '#9CC1E8',
  ...props
}) => {
  return (
    <span
      style={
        {
          '--shimmer-duration': duration,
          '--shimmer-base': baseColor,
          '--shimmer-glint': glintColor,
        } as CSSProperties
      }
      className={cn(
        'inline-block bg-clip-text text-transparent animate-shimmer',
        'bg-[length:200%_100%]',
        'bg-[image:linear-gradient(110deg,var(--shimmer-base),35%,var(--shimmer-glint),65%,var(--shimmer-base))]',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
};
