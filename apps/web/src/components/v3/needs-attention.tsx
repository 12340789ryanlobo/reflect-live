'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from './pill';
import { relativeTime } from '@/lib/format';

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

interface FlaggedAthlete {
  player: Player;
  readiness: number | null;
  lastInbound: string | null;
  reason: 'low' | 'quiet';
  severity: number;
}

export function NeedsAttention({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [flagged, setFlagged] = useState<FlaggedAthlete[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [{ data: ps }, { data: msgs }] = await Promise.all([
        sb.from('players').select('*').eq('team_id', teamId).eq('active', true),
        sb
          .from('twilio_messages')
          .select('player_id,direction,category,body,date_sent')
          .eq('team_id', teamId)
          .gte('date_sent', since)
          .order('date_sent', { ascending: false }),
      ]);
      const players = (ps ?? []) as Player[];
      const messages = (msgs ?? []) as Array<{
        player_id: number | null;
        direction: string;
        category: string;
        body: string | null;
        date_sent: string;
      }>;

      const latestInbound = new Map<number, string>();
      const latestReadiness = new Map<number, number>();
      for (const m of messages) {
        if (m.player_id == null) continue;
        if (m.direction === 'inbound' && !latestInbound.has(m.player_id)) {
          latestInbound.set(m.player_id, m.date_sent);
        }
        if (m.category === 'survey' && m.body && !latestReadiness.has(m.player_id)) {
          const match = /^(\d{1,2})/.exec(m.body.trim());
          if (match) {
            const n = Number(match[1]);
            if (n >= 1 && n <= 10) latestReadiness.set(m.player_id, n);
          }
        }
      }

      const dayAgo = Date.now() - 24 * 3600 * 1000;
      const list: FlaggedAthlete[] = [];
      for (const p of players) {
        const readiness = latestReadiness.get(p.id) ?? null;
        const lastInbound = latestInbound.get(p.id) ?? null;
        const lowReadiness = readiness != null && readiness <= 4;
        const quiet = !lastInbound || new Date(lastInbound).getTime() < dayAgo;
        if (lowReadiness) {
          list.push({
            player: p,
            readiness,
            lastInbound,
            reason: 'low',
            severity: 100 - (readiness ?? 0) * 10,
          });
        } else if (quiet) {
          list.push({
            player: p,
            readiness,
            lastInbound,
            reason: 'quiet',
            severity: lastInbound
              ? (Date.now() - new Date(lastInbound).getTime()) / 3600000
              : 9999,
          });
        }
      }
      list.sort((a, b) => b.severity - a.severity);
      setFlagged(list);
      setLoading(false);
    })();
  }, [sb, teamId]);

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold text-[color:var(--ink)]">Needs attention</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{flagged.length}</span>
      </header>
      {loading ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
      ) : flagged.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
          — everyone&rsquo;s on the wire —
        </p>
      ) : (
        <ul>
          {flagged.slice(0, 8).map(({ player, readiness, lastInbound, reason }) => (
            <li key={player.id}>
              <Link
                href={`/dashboard/players/${player.id}`}
                className="flex items-center gap-3 border-b px-6 py-3 transition hover:bg-[color:var(--card-hover)] last:border-b-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <span
                  className="grid size-8 place-items-center rounded-md border bg-[color:var(--paper)] text-[10.5px] font-bold text-[color:var(--ink-soft)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {initials(player.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[color:var(--ink)] truncate">
                    {player.name}
                  </div>
                  <div className="text-[11.5px] text-[color:var(--ink-mute)] truncate">
                    {player.group ?? 'No group'}
                    {lastInbound ? ` · last reply ${relativeTime(lastInbound)}` : ' · no replies'}
                  </div>
                </div>
                {reason === 'low' && readiness != null ? (
                  <Pill tone="red">readiness {readiness}</Pill>
                ) : (
                  <Pill tone="amber">quiet</Pill>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
