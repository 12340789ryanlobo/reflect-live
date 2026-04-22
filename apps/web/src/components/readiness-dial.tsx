'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * ReadinessDial — the signature hero metric.
 *
 * A circular dial with a sweeping needle that rotates to the value (0–10).
 * Rim glows chlorine when healthy, amber when watching, siren when flagged.
 * Numbered ticks at 0, 2, 4, 6, 8, 10 around the arc.
 *
 * The dial is the app's visual anchor — used on the coach dashboard,
 * the captain page, and the player drill-down. One element carrying
 * identity across the product.
 */
export function ReadinessDial({
  value,
  max = 10,
  responses,
  size = 280,
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
  const ringRadius = size * 0.42;
  const trackRadius = size * 0.36;
  const needleLength = size * 0.32;

  // 270° arc from -135° to +135° (bottom gap)
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

  const ticks = [0, 2, 4, 6, 8, 10];

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
    <div className={cn('relative flex flex-col items-center', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer rim */}
        <circle
          cx={cx}
          cy={cy}
          r={ringRadius}
          fill="none"
          stroke="hsl(220 18% 18%)"
          strokeWidth={1}
        />
        <circle
          cx={cx}
          cy={cy}
          r={ringRadius - 6}
          fill="none"
          stroke="hsl(220 20% 14%)"
          strokeWidth={0.6}
        />

        {/* Tick marks around arc */}
        {ticks.map((t) => {
          const deg = START_DEG + (t / max) * SPAN_DEG;
          const [x1, y1] = polar(deg, trackRadius + 8);
          const [x2, y2] = polar(deg, trackRadius + 18);
          const [lx, ly] = polar(deg, trackRadius + 28);
          return (
            <g key={t}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={value != null && t <= Math.floor(valueClamped) ? toneColor : 'hsl(220 16% 30%)'}
                strokeWidth={1.4}
                strokeLinecap="round"
              />
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                fontFamily="var(--font-mono), monospace"
                fontSize={10}
                fill="hsl(36 10% 62%)"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Empty gauge track */}
        <path
          d={trackPath}
          stroke="hsl(220 18% 16%)"
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
        />

        {/* Progress arc */}
        {value != null && (
          <path
            d={progressPath}
            stroke={toneColor}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 12px ${toneColor})`,
              opacity: 0.95,
            }}
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
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy - needleLength} r={4} fill={toneColor} />
          </g>
        )}

        {/* Center cap */}
        <circle cx={cx} cy={cy} r={8} fill="hsl(220 22% 11%)" stroke={toneColor} strokeWidth={1.2} />
        <circle cx={cx} cy={cy} r={2} fill={toneColor} />
      </svg>

      {/* Centered value + labels — absolute-positioned inside the svg area */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        style={{ paddingBottom: size * 0.1 }}
      >
        <div
          className="eyebrow mb-1"
          style={{ color: value == null ? 'hsl(36 10% 62%)' : toneColor }}
        >
          {label}
        </div>
        <div
          key={String(value)}
          className="metric-value num-display text-[3.2rem] leading-none"
          style={{ color: value == null ? 'hsl(220 16% 34%)' : 'hsl(36 28% 94%)' }}
        >
          {value != null ? value.toFixed(1) : '—'}
        </div>
        {(sublabel || responses != null) && (
          <div className="mono mt-1 text-[0.7rem] text-[hsl(36_10%_62%)] tracking-wider uppercase">
            {sublabel ?? `${responses ?? 0} responses`}
          </div>
        )}
        {flagged != null && flagged > 0 && (
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[0.65rem] font-mono uppercase tracking-[0.18em]"
            style={{
              color: 'hsl(356 82% 62%)',
              borderColor: 'hsl(356 60% 40%)',
              background: 'hsl(356 60% 20% / 0.3)',
            }}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {flagged} flag{flagged === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}
