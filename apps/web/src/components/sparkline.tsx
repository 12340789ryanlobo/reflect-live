'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  showDots?: boolean;
  strokeWidth?: number;
}

export function Sparkline({
  data,
  width = 120,
  height = 28,
  stroke = 'currentColor',
  fill,
  className,
  showDots = false,
  strokeWidth = 1.5,
}: SparklineProps) {
  if (!data.length) {
    return <div className={cn('h-7 w-30 opacity-40', className)} style={{ width, height }} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - strokeWidth * 2) - strokeWidth;
    return [x, y];
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;

  const lastPoint = points[points.length - 1];

  return (
    <svg
      className={cn('sparkline-wrap', className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      preserveAspectRatio="none"
    >
      {fill && <path d={area} fill={fill} opacity={0.18} />}
      <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {showDots && lastPoint && (
        <circle cx={lastPoint[0]} cy={lastPoint[1]} r={2.5} fill={stroke} />
      )}
    </svg>
  );
}

/**
 * Given timestamped events, bucket them into N equal-width buckets over the last `windowMs` ms.
 * Returns a number[] of length `buckets` with counts per bucket.
 */
export function bucketize(timestamps: string[], buckets = 24, windowMs = 24 * 3600 * 1000): number[] {
  const now = Date.now();
  const start = now - windowMs;
  const bucketSize = windowMs / buckets;
  const out = new Array(buckets).fill(0);
  for (const ts of timestamps) {
    const t = new Date(ts).getTime();
    if (t < start || t > now) continue;
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((t - start) / bucketSize)));
    out[idx] += 1;
  }
  return out;
}
