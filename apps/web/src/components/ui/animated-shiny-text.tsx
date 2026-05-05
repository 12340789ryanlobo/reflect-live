// A horizontal shimmer that pans across text. Adapted from magicui's
// pattern but rebuilt around inline styles instead of Tailwind
// arbitrary classes — the previous version's `bg-[image:linear-
// gradient(...)]` and `bg-[length:200%_100%]` arbitraries weren't
// applying reliably in this Tailwind v4 + Turbopack setup, so the
// shimmer never showed. Inline styles are direct CSS, no parser
// dependency, and the keyframe in globals.css drives the animation.
//
// Effect: text is rendered via bg-clip-text from a 200%-wide linear
// gradient that goes base → glint → base. Animating background-position
// from 200% → -200% slides the glint across the text once per cycle.

'use client';

import { type ComponentPropsWithoutRef, type CSSProperties, type FC } from 'react';
import { cn } from '@/lib/utils';

export interface AnimatedShinyTextProps extends ComponentPropsWithoutRef<'span'> {
  /** CSS duration. Slower = calmer. Default 4s so the glint is visible
   *  on a quick page glance rather than a slow ambient pulse. */
  duration?: string;
  /** Base text color — what shows when the glint isn't on top. */
  baseColor?: string;
  /** Glint color — the brighter band that sweeps across. Pick something
   *  noticeably lighter/brighter than baseColor for visible contrast. */
  glintColor?: string;
}

export const AnimatedShinyText: FC<AnimatedShinyTextProps> = ({
  children,
  className,
  duration = '4s',
  baseColor = 'var(--blue)',
  glintColor = '#BFD7EF',
  ...props
}) => {
  return (
    <span
      style={
        {
          color: 'transparent',
          backgroundImage: `linear-gradient(110deg, ${baseColor} 0%, ${baseColor} 30%, ${glintColor} 50%, ${baseColor} 70%, ${baseColor} 100%)`,
          backgroundSize: '200% 100%',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          // -webkit-text-fill-color is needed on Safari for clip:text
          // to actually show the gradient through the text.
          WebkitTextFillColor: 'transparent',
          animation: `shimmer ${duration} linear infinite`,
          '--shimmer-duration': duration,
        } as CSSProperties
      }
      className={cn('inline-block', className)}
      {...props}
    >
      {children}
    </span>
  );
};
