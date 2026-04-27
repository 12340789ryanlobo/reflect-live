'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from './v3/pill';
import { relativeTime } from '@/lib/format';

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function statusOf(iso: string | undefined): { tone: 'green' | 'amber' | 'mute'; label: string } {
  if (!iso) return { tone: 'mute', label: 'Quiet' };
  const hrs = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hrs < 1) return { tone: 'green', label: 'On wire' };
  if (hrs < 24) return { tone: 'green', label: 'Today' };
  if (hrs < 72) return { tone: 'amber', label: 'Watch' };
  return { tone: 'mute', label: 'Quiet' };
}

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
    <section className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-[color:var(--ink)]">Starred athletes</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{players.length}</span>
      </header>

      {!players.length ? (
        <p className="text-[13px] text-[color:var(--ink-mute)]">— star an athlete to track them here —</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((p) => {
            const ts = lastSeen[p.id];
            const status = statusOf(ts);
            return (
              <li key={p.id}>
                <Link
                  href={`/dashboard/player/${p.id}`}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:bg-[color:var(--card-hover)] hover:border-[color:var(--blue-soft-2)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="grid size-8 place-items-center rounded-md border bg-[color:var(--paper)] text-[10.5px] font-bold text-[color:var(--ink-soft)]" style={{ borderColor: 'var(--border)' }}>
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-[color:var(--ink)] truncate">{p.name}</div>
                    <div className="text-[11.5px] text-[color:var(--ink-mute)] truncate">
                      {p.group ?? 'No group'}{ts ? ` · ${relativeTime(ts)}` : ''}
                    </div>
                  </div>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
