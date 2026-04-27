import * as React from 'react';
import { cn } from '@/lib/utils';

export type PillTone = 'blue' | 'green' | 'amber' | 'red' | 'mute';

const TONE: Record<PillTone, { color: string; bg: string }> = {
  blue:  { color: 'var(--blue)',  bg: 'var(--blue-soft)' },
  green: { color: 'var(--green)', bg: 'var(--green-soft)' },
  amber: { color: 'var(--amber)', bg: 'var(--amber-soft)' },
  red:   { color: 'var(--red)',   bg: 'var(--red-soft)' },
  mute:  { color: 'var(--ink-mute)', bg: 'var(--paper-2)' },
};

/**
 * Soft-filled status pill. 10.5px bold uppercase with 0.5px tracking.
 * Use for category tags (Survey/Workout/Rehab), status badges, role markers.
 */
export function Pill({
  tone = 'mute',
  children,
  className,
}: {
  tone?: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  const { color, bg } = TONE[tone];
  return (
    <span
      className={cn(
        'inline-block px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-wide rounded-md',
        className,
      )}
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}
