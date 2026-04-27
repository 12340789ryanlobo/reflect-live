'use client';
import { useEffect, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Pill } from '@/components/v3/pill';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { relativeTime } from '@/lib/format';

function initials(n: string) {
  return n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function FollowUpsPage() {
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastByPlayer, setLastByPlayer] = useState<Map<number, string>>(new Map());
  const [since, setSince] = useState<number>(24);

  useEffect(() => {
    (async () => {
      const { data: ps } = await sb
        .from('players')
        .select('*')
        .eq('team_id', prefs.team_id)
        .eq('active', true);
      setPlayers((ps ?? []) as Player[]);
      const { data: msgs } = await sb
        .from('twilio_messages')
        .select('player_id,date_sent,direction')
        .eq('team_id', prefs.team_id)
        .eq('direction', 'inbound')
        .order('date_sent', { ascending: false });
      const last = new Map<number, string>();
      for (const row of (msgs ?? []) as Array<{ player_id: number | null; date_sent: string }>) {
        if (row.player_id == null) continue;
        if (!last.has(row.player_id)) last.set(row.player_id, row.date_sent);
      }
      setLastByPlayer(last);
    })();
  }, [sb, prefs.team_id]);

  const cutoff = Date.now() - since * 3600000;
  const overdue = players
    .map((p) => ({ p, ts: lastByPlayer.get(p.id) ?? null }))
    .filter(({ ts }) => !ts || new Date(ts).getTime() < cutoff)
    .sort((a, b) => {
      const ta = a.ts ? new Date(a.ts).getTime() : 0;
      const tb = b.ts ? new Date(b.ts).getTime() : 0;
      return ta - tb;
    });

  const sinceLabel = since === 24 ? '24 hours' : since === 72 ? '3 days' : '1 week';

  return (
    <>
      <PageHeader
        eyebrow="Who to chase"
        title="Follow-ups"
        subtitle={`${overdue.length} · quiet ≥ ${sinceLabel}`}
        actions={
          <Select value={String(since)} onValueChange={(v) => setSince(Number(v))}>
            <SelectTrigger className="w-[180px] h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24">No reply in 24 hours</SelectItem>
              <SelectItem value="72">No reply in 3 days</SelectItem>
              <SelectItem value="168">No reply in a week</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Quiet athletes</h2>
            <span className="text-[12px] text-[color:var(--ink-mute)]">ordered by last reply</span>
          </header>
          {overdue.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
              — nobody needs chasing —
            </p>
          ) : (
            <ul>
              {overdue.map(({ p, ts }, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-4 border-b px-5 py-3 last:border-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="mono text-[12px] text-[color:var(--ink-dim)] tabular w-8 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="grid size-9 place-items-center rounded-md border bg-[color:var(--paper)] text-[12px] font-bold shrink-0" style={{ borderColor: 'var(--border)' }}>
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-[color:var(--ink)]">
                      {p.name}
                    </div>
                    <div className="text-[12px] text-[color:var(--ink-dim)]">
                      {p.group ?? 'no group'}
                    </div>
                  </div>
                  <div className="mono text-[12px] text-[color:var(--ink-mute)] tabular hidden md:block">
                    {ts ? `last reply ${relativeTime(ts)}` : 'no messages yet'}
                  </div>
                  <Pill tone={ts ? 'amber' : 'mute'}>{ts ? 'watch' : 'silent'}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
