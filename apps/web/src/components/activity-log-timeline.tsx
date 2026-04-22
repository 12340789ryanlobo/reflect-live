'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ActivityLog, Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { prettyDate, relativeTime } from '@/lib/format';

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
    <Card>
      <CardHeader>
        <CardTitle className="h-serif text-lg">Recent activity</CardTitle>
        <CardDescription>Workouts &amp; rehabs the team has logged</CardDescription>
      </CardHeader>
      <CardContent>
        {!logs.length ? (
          <p className="text-sm italic text-muted-foreground">No activity logged yet.</p>
        ) : (
          <ul className="divide-y">
            {logs.map((l) => {
              const player = l.player_id ? byId.get(l.player_id) : null;
              return (
                <li key={l.id} className="flex items-start gap-3 py-2.5">
                  <Badge variant={l.kind === 'workout' ? 'default' : 'secondary'} className="mt-0.5 shrink-0">
                    {l.kind === 'workout' ? 'Workout' : 'Rehab'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium truncate">{player?.name ?? 'Unknown athlete'}</span>
                      <span className="text-xs text-muted-foreground tabular shrink-0" title={prettyDate(l.logged_at)}>
                        {relativeTime(l.logged_at)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground leading-snug">{l.description}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
