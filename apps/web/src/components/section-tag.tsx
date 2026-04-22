import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A numbered section label. Reads as "01. THE WIRE" — a station code
 * plus eyebrow name. Used to divide page content into editorial sections
 * the way a broadcast rundown or almanac does.
 */
export function SectionTag({
  code,
  name,
  live,
  right,
  className,
}: {
  code?: string;
  name: string;
  live?: boolean;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-[color:var(--hairline)] pb-2',
        className,
      )}
    >
      <div className="flex items-baseline gap-3">
        {code && <span className="station-code">{code}</span>}
        <span className="eyebrow">{name}</span>
        {live && (
          <span className="inline-flex items-center gap-1.5">
            <span className="live-dot" />
            <span className="eyebrow-signal">LIVE</span>
          </span>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/**
 * A big editorial masthead heading that sits inside a page —
 * display-weight Fraunces with an italic accent span. Use for page
 * titles inside the dashboard shell.
 */
export function Masthead({
  eyebrow,
  title,
  italic,
  trail,
  right,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  italic?: React.ReactNode;
  trail?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-6 flex-wrap', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="h-display text-5xl md:text-6xl">
          {title}
          {italic && (
            <>
              {' '}
              <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
                {italic}
              </span>
            </>
          )}
          {trail && <span className="h-display">{trail}</span>}
        </h1>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
