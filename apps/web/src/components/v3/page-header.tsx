import * as React from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * The standard page header: eyebrow + big sans title + thin meta line + right-side actions.
 * Sticky to the top, white-with-subtle-shadow surface.
 *
 * NOTE: During the Phase 0 migration only, this component also accepts (and ignores)
 * deprecated v2 props `code`, `italic`, `right` so the build doesn't break before
 * each page is rewritten. Task 23 of the plan removes the deprecated props once
 * no callers reference them anymore.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  live,
  // Deprecated v2 props — silently ignored, removed in Task 23
  code: _code,
  italic: _italic,
  right,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  live?: boolean;
  /** @deprecated v2 prop, no-op in v3 */
  code?: React.ReactNode;
  /** @deprecated v2 prop, no-op in v3 */
  italic?: React.ReactNode;
  /** @deprecated use `actions` */
  right?: React.ReactNode;
}) {
  const rightSide = actions ?? right;
  return (
    <header
      className="sticky top-0 z-20 border-b bg-[color:var(--card)]/90 backdrop-blur"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-3 px-4 md:px-8 py-4">
        <SidebarTrigger className="text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {eyebrow && (
              <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[color:var(--ink-mute)]">
                {eyebrow}
              </span>
            )}
            {live && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--green)]">
                <span className="live-dot" />
                Live
              </span>
            )}
          </div>
          <h1
            className={cn(
              'text-2xl md:text-3xl font-bold leading-tight tracking-[-0.01em] text-[color:var(--ink)] truncate',
              eyebrow && 'mt-0.5',
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <div className="mt-1 text-[13px] text-[color:var(--ink-mute)] truncate">{subtitle}</div>
          )}
        </div>
        {rightSide && <div className="flex items-center gap-2 shrink-0">{rightSide}</div>}
      </div>
    </header>
  );
}
