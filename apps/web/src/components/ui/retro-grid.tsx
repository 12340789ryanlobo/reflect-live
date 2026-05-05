// Pure-CSS retro grid floor. Inspired by magicui's RetroGrid component
// (https://magicui.design/r/retro-grid.json) but written without the
// WebGL canvas — for a static marketing CTA the perspective-tilted
// grid effect is just two stacked linear-gradients with a CSS
// transform + a top-fade mask. The same technique the reference site
// (`reflect-landing-pages.vercel.app/round2.5/final-c.html`) uses
// hand-rolled, just packaged as a reusable React component scoped to
// reflect-live's --blue palette.
//
// The grid lines flow toward the viewer via an animated translateY on
// the gradient layer; the parent perspective + rotateX makes that
// motion read as "moving toward the camera" instead of just sliding
// down. Animation duration controls how fast that flow feels.

import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface RetroGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Tilt of the grid plane. Higher = more dramatic perspective. */
  angleDegrees?: number;
  /** Cell size in px. */
  cellSize?: number;
  /** Grid line color — pass a CSS color or a var() reference. */
  lineColor?: string;
  /** Overall opacity. */
  opacity?: number;
  /** Loop duration of the line-flow animation. */
  duration?: string;
  /** Vertical share of the section the grid occupies, 0–1. */
  heightFraction?: number;
}

export function RetroGrid({
  className,
  angleDegrees = 60,
  cellSize = 48,
  lineColor = 'var(--blue)',
  opacity = 0.18,
  duration = '12s',
  heightFraction = 0.7,
  style,
  ...props
}: RetroGridProps) {
  const cssVars = {
    '--rg-angle': `${angleDegrees}deg`,
    '--rg-cell': `${cellSize}px`,
    '--rg-line-color': lineColor,
    '--rg-duration': duration,
    '--rg-height-pct': `${Math.round(heightFraction * 100)}%`,
    '--rg-opacity': String(opacity),
  } as CSSProperties;

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className,
      )}
      style={{ ...cssVars, ...style }}
      {...props}
    >
      <div className="retro-grid-floor" />
    </div>
  );
}
