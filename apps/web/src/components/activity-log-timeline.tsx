'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ActivityLog, Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from './v3/pill';
import { prettyDate } from '@/lib/format';

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
    <section className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-[color:var(--ink)]">Activity</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{logs.length}</span>
      </header>
      {!logs.length ? (
        <p className="text-[13px] text-[color:var(--ink-mute)]">— no recent activity —</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {logs.map((l) => {
            const player = l.player_id ? byId.get(l.player_id) : null;
            const tone = l.kind === 'workout' ? 'green' : 'amber';
            return (
              <li key={l.id} className="flex items-start gap-4 py-3 border-[color:var(--border)]">
                <div className="text-[12px] font-semibold text-[color:var(--ink-mute)] tabular min-w-[64px] pt-0.5">
                  {prettyDate(l.logged_at)}
                </div>
                <div className="pt-0.5">
                  <Pill tone={tone}>{l.kind}</Pill>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[color:var(--ink)]">{player?.name ?? 'Unknown'}</div>
                  <div className="text-[13px] text-[color:var(--ink-soft)] leading-relaxed">{l.description}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
