'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ActivityLog, Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { SectionTag } from '@/components/section-tag';
import { relativeTime } from '@/lib/format';

/**
 * ActivityLogTimeline — "THE LOG"
 *
 * A ruled timeline reading like a training-room notebook. Each row has
 * a time-column, a kind pill, a player name, and the description.
 * No card chrome — just hairlines and typography.
 */
export function ActivityLogTimeline({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: p }] = await Promise.all([
        sb.from('activity_logs').select('*').eq('team_id', teamId).order('logged_at', { ascending: false }).limit(20),
        sb.from('players').select('*').eq('team_id', teamId),
      ]);
      if (l) setLogs(l as ActivityLog[]);
      if (p) setPlayers(p as Player[]);
    })();
  }, [sb, teamId]);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  return (
    <div className="panel px-5 py-5">
      <SectionTag
        name="Activity log"
        right={
          <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
            {logs.length}
          </span>
        }
      />

      {!logs.length ? (
        <p className="mt-6 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
          — no logs recorded yet —
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[color:var(--hairline)]/70">
          {logs.map((l) => {
            const player = l.player_id ? byId.get(l.player_id) : null;
            const tone = l.kind === 'workout'
              ? { color: 'hsl(162 62% 54%)', bg: 'hsl(162 40% 18% / 0.4)', border: 'hsl(162 40% 40%)' }
              : { color: 'hsl(38 90% 62%)',  bg: 'hsl(38 60% 20% / 0.4)',  border: 'hsl(38 60% 40%)' };
            return (
              <li key={l.id} className="flex items-start gap-4 py-3">
                <div className="shrink-0 w-[88px] text-right">
                  <div className="mono text-[0.7rem] text-[color:var(--bone-soft)] tabular">
                    {new Date(l.logged_at).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                  </div>
                  <div className="mono text-[0.6rem] text-[color:var(--bone-dim)] tabular">
                    {relativeTime(l.logged_at)}
                  </div>
                </div>
                <div className="shrink-0 w-px self-stretch bg-[color:var(--hairline)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="mono px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] rounded-sm"
                      style={{
                        color: tone.color,
                        background: tone.bg,
                        border: `1px solid ${tone.border}`,
                      }}
                    >
                      {l.kind}
                    </span>
                    <span className="text-sm font-semibold text-[color:var(--bone)]">
                      {player?.name ?? 'Unknown athlete'}
                    </span>
                    {player?.group && (
                      <span className="mono text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                        {player.group}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm leading-relaxed text-[color:var(--bone-soft)]">
                    {l.description}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
