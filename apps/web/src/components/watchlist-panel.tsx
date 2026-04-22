'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Star } from 'lucide-react';
import { relativeTime } from '@/lib/format';

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function WatchlistPanel({ teamId, watchlist }: { teamId: number; watchlist: number[] }) {
  const sb = useSupabase();
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastSeen, setLastSeen] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!watchlist.length) { setPlayers([]); setLastSeen({}); return; }
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
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="h-serif text-lg">Watchlist</CardTitle>
        <CardDescription>
          {players.length === 0
            ? 'No starred players yet'
            : `${players.length} starred player${players.length === 1 ? '' : 's'}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!players.length ? (
          <p className="text-sm italic text-muted-foreground">
            Tap the star on any player page to add them here — they&apos;ll surface first when they message.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {sorted.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/player/${p.id}`}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 hover:border-primary hover:bg-primary/5 transition"
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-[10px] font-medium">{initials(p.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Star className="size-3 fill-primary text-primary" />
                      <span className="truncate text-sm font-medium">{p.name}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.group ?? 'No group'}
                      {lastSeen[p.id] && <span> · last reply {relativeTime(lastSeen[p.id])}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
