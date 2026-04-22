'use client';
import { useEffect, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { relativeTime } from '@/lib/format';

function initials(n: string) { return n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase(); }

export default function FollowUpsPage() {
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastByPlayer, setLastByPlayer] = useState<Map<number, string>>(new Map());
  const [since, setSince] = useState<number>(24);

  useEffect(() => {
    (async () => {
      const { data: ps } = await sb.from('players').select('*').eq('team_id', prefs.team_id).eq('active', true);
      setPlayers((ps ?? []) as Player[]);
      const { data: msgs } = await sb.from('twilio_messages')
        .select('player_id,date_sent,direction')
        .eq('team_id', prefs.team_id).eq('direction', 'inbound').order('date_sent', { ascending: false });
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

  return (
    <>
      <PageHeader title="Follow-ups" subtitle={<Badge variant="secondary">Captain view</Badge>} right={
        <Select value={String(since)} onValueChange={(v) => setSince(Number(v))}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="24">No reply in 24 hours</SelectItem>
            <SelectItem value="72">No reply in 3 days</SelectItem>
            <SelectItem value="168">No reply in a week</SelectItem>
          </SelectContent>
        </Select>
      } />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardContent className="p-0">
            {overdue.length === 0 ? (
              <p className="p-6 text-sm italic text-muted-foreground">Nobody needs chasing.</p>
            ) : (
              <ul className="divide-y">
                {overdue.map(({ p, ts }) => (
                  <li key={p.id} className="flex items-center gap-3 px-6 py-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="text-[11px] font-medium">{initials(p.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.group ?? 'No group'}</div>
                    </div>
                    <div className="text-sm text-muted-foreground tabular">
                      {ts ? `last reply ${relativeTime(ts)}` : 'no messages yet'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
