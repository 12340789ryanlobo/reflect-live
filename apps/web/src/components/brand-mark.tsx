import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * reflect·live monogram — an italic serif "R" whose terminal stroke
 * extends into a horizontal timing bar that seats the "L" alongside.
 * Reads as a competition-mark — works for any sport.
 */
export function BrandMark({
  className,
  size = 28,
  tone = 'heritage',
}: {
  className?: string;
  size?: number;
  tone?: 'heritage' | 'bone' | 'signal' | 'ink';
}) {
  const fill = {
    heritage: 'hsl(358 78% 58%)',
    bone: 'hsl(36 28% 94%)',
    signal: 'hsl(188 82% 58%)',
    ink: 'hsl(220 28% 5%)',
  }[tone];
  return (
    <svg
      className={cn('shrink-0', className)}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-label="reflect·live"
    >
      <rect
        x="0.75"
        y="0.75"
        width="38.5"
        height="38.5"
        rx="5"
        stroke={fill}
        strokeWidth="1.2"
        fill="none"
        opacity="0.35"
      />
      {/* Serif italic "R·l" — custom letterform */}
      <g fill={fill}>
        {/* R stem */}
        <path d="M9 9.5 L9 30.2 L12.5 30.2 L12.5 22 L14.6 22 L18.3 30.2 L22.1 30.2 L17.9 21.4 C19.8 20.7 21 19 21 16.4 C21 12.6 18.4 9.5 14.6 9.5 Z M12.5 12.3 L14.4 12.3 C16.3 12.3 17.5 13.7 17.5 15.8 C17.5 17.9 16.3 19.3 14.4 19.3 L12.5 19.3 Z" />
        {/* Center dot */}
        <circle cx="24" cy="22" r="1.2" />
        {/* l stem */}
        <path d="M27.5 9.5 L27.5 30.2 L31 30.2 L31 9.5 Z" />
      </g>
      {/* Timing hairline under the marks — the signature element */}
      <line
        x1="6"
        y1="33.5"
        x2="34"
        y2="33.5"
        stroke={fill}
        strokeWidth="0.9"
        opacity="0.85"
      />
      <circle cx="6" cy="33.5" r="1.1" fill={fill} />
      <circle cx="34" cy="33.5" r="1.1" fill={fill} />
    </svg>
  );
}

/**
 * Full wordmark — brand mark + "reflect·live" text
 */
export function Wordmark({
  className,
  size = 28,
  tone = 'heritage',
}: {
  className?: string;
  size?: number;
  tone?: 'heritage' | 'bone' | 'signal' | 'ink';
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark size={size} tone={tone} />
      <span className="h-serif text-[1.05rem] font-semibold tracking-tight leading-none">
        reflect<span className="opacity-50">·</span>live
      </span>
    </span>
  );
}
