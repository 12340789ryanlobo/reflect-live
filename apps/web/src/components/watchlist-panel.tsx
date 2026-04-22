'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
import { relativeTime } from '@/lib/format';

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function hoursSince(iso: string | undefined): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

/**
 * WatchlistPanel — "STARRED"
 *
 * A compact list of players the coach has starred. Each row is a
 * clipboard-style card with name, group, a stamped status (LIVE /
 * WATCH / QUIET depending on recency of last inbound), and the
 * relative timestamp.
 */
export function WatchlistPanel({ teamId, watchlist }: { teamId: number; watchlist: number[] }) {
  const sb = useSupabase();
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastSeen, setLastSeen] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!watchlist.length) {
      setPlayers([]);
      setLastSeen({});
      return;
    }
    (async () => {
      const [{ data: ps }, { data: msgs }] = await Promise.all([
        sb.from('players').select('*').in('id', watchlist).eq('team_id', teamId),
        sb.from('twilio_messages').select('player_id,date_sent').in('player_id', watchlist).eq('direction', 'inbound').order('date_sent', { ascending: false }),
      ]);
      if (ps) setPlayers(ps as Player[]);
      const seen: Record<number, string> = {};
      for (const m of (msgs ?? []) as Array<{ player_id: number; date_sent: string }>) {
        if (m.player_id != null && !seen[m.player_id]) seen[m.player_id] = m.date_sent;
      }
      setLastSeen(seen);
    })();
  }, [sb, teamId, watchlist]);

  const sorted = useMemo(() => {
    return [...players].sort((a, b) => {
      const ta = lastSeen[a.id] ? new Date(lastSeen[a.id]).getTime() : 0;
      const tb = lastSeen[b.id] ? new Date(lastSeen[b.id]).getTime() : 0;
      return tb - ta;
    });
  }, [players, lastSeen]);

  return (
    <div className="panel p-5">
      <SectionTag
        name="Starred"
        right={
          <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
            {players.length}
          </span>
        }
      />

      {!players.length ? (
        <p className="mt-6 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
          — star an athlete to track them here —
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {sorted.map((p, i) => {
            const ts = lastSeen[p.id];
            const hrs = hoursSince(ts);
            const stampTone = hrs == null
              ? 'quiet'
              : hrs < 1
              ? 'live'
              : hrs < 24
              ? 'on'
              : hrs < 72
              ? 'watch'
              : 'quiet';
            const stampText = hrs == null
              ? '— quiet —'
              : hrs < 1
              ? 'live'
              : hrs < 24
              ? 'on wire'
              : hrs < 72
              ? 'watch'
              : 'quiet';
            return (
              <li key={p.id}>
                <Link
                  href={`/dashboard/player/${p.id}`}
                  className="group relative flex items-center gap-3 rounded-sm border border-[color:var(--hairline)] bg-[color:var(--panel-raised)]/50 px-3 py-2.5 transition hover:border-[color:var(--signal)]/60 hover:bg-[color:var(--panel-raised)]"
                >
                  <span className="mono text-[0.62rem] text-[color:var(--bone-dim)] tabular w-6 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="grid size-7 place-items-center rounded-sm border border-[color:var(--hairline)] bg-[color:var(--panel-over)] text-[0.66rem] font-semibold shrink-0">
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[color:var(--bone)]">
                      {p.name}
                    </div>
                    <div className="mono truncate text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                      {p.group ?? 'no group'} · {ts ? relativeTime(ts) : 'no messages'}
                    </div>
                  </div>
                  <Stamp tone={stampTone} rotate={i % 2 === 0 ? -2 : 1.5}>
                    {stampText}
                  </Stamp>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
