// Pure-CSS retro grid floor — STATIC, no animation. The previous
// version animated background-position to make the lines flow toward
// the viewer, which produced visible moiré flicker at certain DPI +
// zoom combos because the perspective transform aggressively
// compresses the line spacing toward the horizon. A static grid
// reads as a calm 'floor' without that aliasing artifact.
//
// Inspired by magicui's RetroGrid component but built without the
// 600-line WebGL canvas; for a marketing CTA the visual is the
// perspective tilt, not the motion.

import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface RetroGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Tilt of the grid plane. Higher = more dramatic perspective. */
  angleDegrees?: number;
  /** Cell size in px. Larger cells = fewer line crossings near the
   *  horizon → less risk of visible aliasing. */
  cellSize?: number;
  /** Grid line color — pass a CSS color or a var() reference. */
  lineColor?: string;
  /** Overall opacity. */
  opacity?: number;
  /** Vertical share of the section the grid occupies, 0–1. */
  heightFraction?: number;
  /** Line thickness in px. ≥1.5 reduces visible aliasing on retina. */
  lineWidth?: number;
}

export function RetroGrid({
  className,
  angleDegrees = 60,
  cellSize = 56,
  lineColor = 'var(--blue)',
  opacity = 0.12,
  heightFraction = 0.72,
  lineWidth = 1.5,
  style,
  ...props
}: RetroGridProps) {
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
        className="absolute bottom-0"
        style={{
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
        } as CSSProperties}
      />
    </div>
  );
}
