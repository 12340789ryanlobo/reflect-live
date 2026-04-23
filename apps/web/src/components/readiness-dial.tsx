'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * ReadinessDial — the signature metric.
 *
 * A clean circular gauge, 0–10. No tick numbers — the arc tells you
 * enough; the big number tells you the rest. Label sits ABOVE the
 * dial, not inside (so it never clips with the arc). Rim glows
 * chlorine / amber / siren based on value.
 */
export function ReadinessDial({
  value,
  max = 10,
  responses,
  size = 260,
  label = 'Team readiness',
  sublabel,
  flagged,
  className,
}: {
  value: number | null;
  max?: number;
  responses?: number;
  size?: number;
  label?: string;
  sublabel?: string;
  flagged?: number;
  className?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const ringRadius = size * 0.44;
  const trackRadius = size * 0.38;
  const needleLength = size * 0.3;

  // 270° arc, gap at bottom
  const START_DEG = -135;
  const END_DEG = 135;
  const SPAN_DEG = END_DEG - START_DEG;

  const valueClamped = value == null ? 0 : Math.min(max, Math.max(0, value));
  const valueFrac = valueClamped / max;
  const valueDeg = START_DEG + valueFrac * SPAN_DEG;

  const tone: 'chlorine' | 'amber' | 'siren' | 'dim' =
    value == null
      ? 'dim'
      : value < 4
      ? 'siren'
      : value < 6
      ? 'amber'
      : 'chlorine';

  const toneColor = {
    chlorine: 'hsl(162 62% 54%)',
    amber: 'hsl(38 90% 62%)',
    siren: 'hsl(356 82% 62%)',
    dim: 'hsl(220 16% 34%)',
  }[tone];

  function polar(deg: number, r: number): [number, number] {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function arcPath(startDeg: number, endDeg: number, r: number): string {
    const [sx, sy] = polar(startDeg, r);
    const [ex, ey] = polar(endDeg, r);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }

  const trackPath = arcPath(START_DEG, END_DEG, trackRadius);
  const progressPath = arcPath(START_DEG, valueDeg, trackRadius);

  return (
    <div className={cn('relative flex flex-col items-center gap-3', className)}>
      {/* Label ABOVE the dial so nothing clips */}
      <div className="text-center">
        <div
          className="mono text-[0.64rem] font-semibold uppercase tracking-[0.24em]"
          style={{ color: value == null ? 'hsl(36 10% 62%)' : toneColor }}
        >
          {label}
        </div>
      </div>

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Outer rim — a single subtle ring */}
          <circle
            cx={cx}
            cy={cy}
            r={ringRadius}
            fill="none"
            stroke="hsl(220 18% 18%)"
            strokeWidth={1}
          />

          {/* Empty gauge track */}
          <path
            d={trackPath}
            stroke="hsl(220 18% 16%)"
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
          />

          {/* Progress arc */}
          {value != null && (
            <path
              d={progressPath}
              stroke={toneColor}
              strokeWidth={10}
              fill="none"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 10px ${toneColor})` }}
            />
          )}

          {/* Needle */}
          {value != null && (
            <g className="dial-needle" key={String(value)} transform={`rotate(${valueDeg} ${cx} ${cy})`}>
              <line
                x1={cx}
                y1={cy}
                x2={cx}
                y2={cy - needleLength}
                stroke={toneColor}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Center hub */}
          <circle cx={cx} cy={cy} r={6} fill="hsl(220 22% 11%)" stroke={toneColor} strokeWidth={1} />
        </svg>

        {/* Big value sits absolutely centered INSIDE the svg area */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <div
            key={String(value)}
            className="metric-value num-display leading-none"
            style={{
              color: value == null ? 'hsl(220 16% 34%)' : 'hsl(36 28% 94%)',
              fontSize: `${size * 0.26}px`,
            }}
          >
            {value != null ? value.toFixed(1) : '—'}
          </div>
          <div
            className="mono mt-1 text-[0.62rem] tracking-[0.2em] uppercase"
            style={{ color: 'hsl(36 10% 62%)' }}
          >
            / {max.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Sublabel + flag marker sit below the dial */}
      {(sublabel || (flagged != null && flagged > 0) || responses != null) && (
        <div className="flex items-center gap-3 mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-mute)]">
          {sublabel ? (
            <span>{sublabel}</span>
          ) : responses != null ? (
            <span>{responses} responses</span>
          ) : null}
          {flagged != null && flagged > 0 && (
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: 'hsl(356 82% 62%)' }}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {flagged} flag{flagged === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
