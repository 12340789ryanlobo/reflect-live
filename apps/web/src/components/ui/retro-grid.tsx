// Pure-CSS retro grid floor. Inspired by magicui's RetroGrid + the
// reference site's hand-rolled version, packaged as a reusable
// component scoped to reflect-live's --blue palette.
//
// Animation: we translateY the gradient by one cellSize so the loop
// is seamless (start state == end state, no snap). Translating via
// `background-position` instead of `transform` keeps the line color
// crisp, and animating by an exact cell multiple is what eliminates
// the flicker we saw before — the previous version moved by an
// arbitrary distance which left the loop boundary mid-cell, where
// the snap was visible against the perspective-compressed spacing.
//
// `will-change: background-position` is a hint to the browser to
// keep the layer composited so subpixel jitter is minimized during
// the scroll.

import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface RetroGridProps extends HTMLAttributes<HTMLDivElement> {
  angleDegrees?: number;
  cellSize?: number;
  lineColor?: string;
  opacity?: number;
  heightFraction?: number;
  lineWidth?: number;
  /** Animation cycle length. Set to '0s' or undefined to disable.
   *  Default 4s — slow enough to feel ambient, fast enough to read
   *  as a flowing floor. */
  duration?: string;
}

export function RetroGrid({
  className,
  angleDegrees = 60,
  cellSize = 60,
  lineColor = 'var(--blue)',
  opacity = 0.13,
  heightFraction = 0.72,
  lineWidth = 1.5,
  duration = '4s',
  style,
  ...props
}: RetroGridProps) {
  // Inline keyframe scoped via CSS variable name so multiple instances
  // (different cellSizes) don't collide. The translate distance is
  // exactly one cellSize so the loop is seamless.
  const animationStyle = duration && duration !== '0s'
    ? { animation: `retroGridScroll ${duration} linear infinite` }
    : {};

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className,
      )}
      style={style}
      {...props}
    >
      <div
        className="absolute bottom-0 will-change-[background-position]"
        style={
          {
            left: '-50%',
            right: '-50%',
            height: `${Math.round(heightFraction * 100)}%`,
            opacity,
            backgroundImage: `linear-gradient(to right, ${lineColor} ${lineWidth}px, transparent ${lineWidth}px), linear-gradient(to bottom, ${lineColor} ${lineWidth}px, transparent ${lineWidth}px)`,
            backgroundSize: `${cellSize}px ${cellSize}px`,
            transform: `perspective(500px) rotateX(${angleDegrees}deg)`,
            transformOrigin: 'center bottom',
            WebkitMaskImage:
              'linear-gradient(to top, black 12%, transparent 88%)',
            maskImage: 'linear-gradient(to top, black 12%, transparent 88%)',
            // Inline custom property so the keyframe can reference the
            // exact cell size for a seamless scroll.
            '--rg-cell': `${cellSize}px`,
            ...animationStyle,
          } as unknown as React.CSSProperties
        }
      />
    </div>
  );
}
