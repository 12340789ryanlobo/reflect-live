'use client';
import { useEffect, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
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

  const sinceLabel = since === 24 ? '24 HOURS' : since === 72 ? '3 DAYS' : '1 WEEK';

  return (
    <>
      <PageHeader
        eyebrow="Who to chase"
        title="Follow-ups"
        subtitle={`${overdue.length} · QUIET ≥ ${sinceLabel}`}
        right={
          <Select value={String(since)} onValueChange={(v) => setSince(Number(v))}>
            <SelectTrigger className="w-[180px] h-9 mono text-xs uppercase tracking-wider">
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

      <main className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        <section className="reveal reveal-1 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag
              name="Quiet athletes"
              right={
                <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                  ORDERED BY LAST REPLY
                </span>
              }
            />
          </div>
          {overdue.length === 0 ? (
            <p className="px-6 py-10 text-center mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — nobody needs chasing —
            </p>
          ) : (
            <ul>
              {overdue.map(({ p, ts }, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-4 border-b border-[color:var(--hairline)]/60 px-5 py-3 last:border-0"
                >
                  <span className="mono text-[0.66rem] text-[color:var(--bone-dim)] tabular w-8 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="grid size-9 place-items-center rounded-sm border border-[color:var(--hairline)] bg-[color:var(--panel-raised)] text-[0.7rem] font-semibold shrink-0">
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[color:var(--bone)]">
                      {p.name}
                    </div>
                    <div className="mono text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                      {p.group ?? 'no group'}
                    </div>
                  </div>
                  <div className="mono text-sm text-[color:var(--bone-mute)] tabular hidden md:block">
                    {ts ? `last reply ${relativeTime(ts)}` : 'no messages yet'}
                  </div>
                  <Stamp tone={ts ? 'watch' : 'quiet'}>{ts ? 'watch' : 'silent'}</Stamp>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
