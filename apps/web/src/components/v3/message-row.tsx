import * as React from 'react';
import { cn } from '@/lib/utils';
import { Pill, type PillTone } from './pill';

/**
 * Single row in a message list — time / category pill / name / body / optional score.
 * Used in dashboard messages, profile messages, athlete view messages.
 */
export function MessageRow({
  time,
  category,
  categoryTone = 'mute',
  name,
  body,
  score,
  scoreTone,
  meta,
  highlight,
  onClick,
  className,
}: {
  time: string;
  category: string;
  categoryTone?: PillTone;
  name: React.ReactNode;
  body?: React.ReactNode;
  score?: React.ReactNode;
  scoreTone?: 'green' | 'amber' | 'red';
  meta?: React.ReactNode;
  highlight?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const scoreColor =
    scoreTone === 'red'
      ? 'var(--red)'
      : scoreTone === 'amber'
      ? 'var(--amber)'
      : 'var(--green)';
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-4 px-6 py-3.5 border-b border-[color:var(--border)] last:border-b-0 transition',
        highlight && 'slide-in-row',
        onClick && 'cursor-pointer hover:bg-[color:var(--card-hover)]',
        className,
      )}
    >
      <div className="mono text-[12px] font-semibold text-[color:var(--ink-mute)] tabular min-w-[52px] pt-[3px]">
        {time}
      </div>
      <div className="pt-[3px]">
        <Pill tone={categoryTone}>{category}</Pill>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-[color:var(--ink)]">{name}</div>
        {body && (
          <div className="mt-0.5 text-[13px] text-[color:var(--ink-soft)] leading-relaxed">
            {body}
          </div>
        )}
        {meta && (
          <div className="mt-1 text-[11.5px] text-[color:var(--ink-mute)]">{meta}</div>
        )}
      </div>
      {score != null && (
        <div
          className="text-[26px] font-bold tabular leading-none pt-[3px]"
          style={{ color: scoreColor }}
        >
          {score}
        </div>
      )}
    </div>
  );
}
