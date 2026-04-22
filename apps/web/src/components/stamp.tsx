import * as React from 'react';
import { cn } from '@/lib/utils';

type StampTone = 'live' | 'flag' | 'on' | 'watch' | 'quiet';

const TONE: Record<StampTone, { color: string; bg: string; border: string }> = {
  live:  { color: 'hsl(188 82% 58%)', bg: 'hsl(188 60% 20% / 0.3)', border: 'hsl(188 60% 42%)' },
  flag:  { color: 'hsl(356 82% 62%)', bg: 'hsl(356 60% 22% / 0.3)', border: 'hsl(356 60% 42%)' },
  on:    { color: 'hsl(162 62% 54%)', bg: 'hsl(162 40% 18% / 0.3)', border: 'hsl(162 40% 40%)' },
  watch: { color: 'hsl(38 90% 62%)',  bg: 'hsl(38 60% 20% / 0.3)',  border: 'hsl(38 60% 42%)' },
  quiet: { color: 'hsl(36 10% 62%)',  bg: 'hsl(220 14% 14%)',       border: 'hsl(220 14% 28%)' },
};

/**
 * A rubber-stamp-style badge — set slightly tilted, monospace,
 * heavy letter-spacing. Feels like something a coach ink-stamped
 * onto a clipboard page.
 */
export function Stamp({
  children,
  tone = 'live',
  rotate,
  className,
}: {
  children: React.ReactNode;
  tone?: StampTone;
  rotate?: number; // degrees, default mild random via prop
  className?: string;
}) {
  const { color, bg, border } = TONE[tone];
  return (
    <span
      className={cn('inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.22em]', className)}
      style={{
        color,
        background: bg,
        border: `1.2px solid ${border}`,
        borderRadius: '2px',
        transform: `rotate(${rotate ?? -1.5}deg)`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
