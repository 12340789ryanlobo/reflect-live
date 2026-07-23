// apps/web/src/components/v3/leaderboard.tsx
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { LeaderboardRow, TeamScoring } from '@/lib/scoring';

/**
 * Leaderboard card. Renders a card with title, then a numbered list of athletes
 * with workouts/rehabs counts and total points. Top 3 ranks are emphasized.
 *
 * The optional `scoring` prop renders the active per-team scoring config
 * (e.g., "W=1.0pt / R=0.6pt") in the header — useful both as a UI affordance
 * and as a debugging surface so coaches can verify what values are actually
 * being applied without diving into Settings.
 */
export function Leaderboard({
  title,
  rows,
  scoring,
  highlightPlayerId,
  emptyText = '— no points yet — text the team line to start logging.',
  className,
  compact = false,
}: {
  title: string;
  rows: LeaderboardRow[];
  scoring?: TeamScoring;
  highlightPlayerId?: number;
  emptyText?: string;
  className?: string;
  /** Condensed variant: denser rows in a fixed-height scroll box so a
   *  full-roster leaderboard stays compact on the page instead of running
   *  the length of the roster. The list still scrolls to everyone. */
  compact?: boolean;
}) {
  return (
    <section
      className={cn('rounded-2xl bg-[color:var(--card)] border', compact && 'relative overflow-hidden', className)}
      style={{ borderColor: 'var(--border)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-bold text-[color:var(--ink)]">{title}</h2>
          {scoring && (
            <span className="text-[11.5px] text-[color:var(--ink-mute)]">
              W={scoring.workout_score}pt / R={scoring.rehab_score}pt
            </span>
          )}
        </div>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">{emptyText}</p>
      ) : (
        <ol className={compact ? 'max-h-[260px] overflow-y-auto overscroll-contain' : undefined}>
          {rows.map((row, i) => {
            const rank = i + 1;
            const isTop3 = rank <= 3;
            const isMe = highlightPlayerId === row.player_id;
            return (
              <li key={row.player_id}>
                <Link
                  href={`/dashboard/players/${row.player_id}`}
                  className={cn(
                    'flex items-center gap-3 border-b transition hover:bg-[color:var(--card-hover)] last:border-b-0',
                    compact ? 'px-6 py-2' : 'px-6 py-3',
                    isMe && 'bg-[color:var(--blue-soft)]/40',
                  )}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span
                    className={cn(
                      'tabular font-bold w-8 text-center',
                      isTop3 ? 'text-[18px]' : 'text-[14px] text-[color:var(--ink-mute)]',
                    )}
                    style={isTop3 ? { color: 'var(--blue)' } : undefined}
                  >
                    {rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-[color:var(--ink)] truncate">
                      {row.name}
                      {isMe && (
                        <span className="ml-2 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--blue)]">
                          you
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-[color:var(--ink-mute)] truncate">
                      {row.group ?? 'No group'} · {row.workouts}w · {row.rehabs}r
                    </div>
                  </div>
                  <div
                    className="tabular text-[15px] font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {row.points.toFixed(row.points % 1 === 0 ? 0 : 1)}
                    <span className="ml-1 text-[11px] font-medium text-[color:var(--ink-mute)]">pt</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {compact && rows.length > 5 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
          style={{ background: 'linear-gradient(to top, var(--card), transparent)' }}
        />
      )}
    </section>
  );
}
