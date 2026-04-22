'use client';
import { use, useEffect, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StarButton } from '@/components/star-button';
import { Metric } from '@/components/metric-card';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, TwilioMessage, ActivityLog, Category } from '@reflect-live/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareText, Dumbbell, HeartPulse, Heart } from 'lucide-react';
import { prettyCategory, prettyDate, prettyDateTime, prettyDirection, prettyPhone, relativeTime } from '@/lib/format';

const CAT_VARIANT: Record<Category, React.ComponentProps<typeof Badge>['variant']> = {
  workout: 'default',
  rehab: 'secondary',
  survey: 'outline',
  chat: 'outline',
};

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const playerId = Number(id);
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [player, setPlayer] = useState<Player | null>(null);
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: m }, { data: l }] = await Promise.all([
        sb.from('players').select('*').eq('id', playerId).single(),
        sb.from('twilio_messages').select('*').eq('player_id', playerId).order('date_sent', { ascending: false }).limit(50),
        sb.from('activity_logs').select('*').eq('player_id', playerId).order('logged_at', { ascending: false }).limit(30),
      ]);
      setPlayer(p as Player);
      setMsgs((m ?? []) as TwilioMessage[]);
      setLogs((l ?? []) as ActivityLog[]);
    })();
  }, [sb, playerId]);

  if (!player) {
    return (
      <>
        <PageHeader title="Loading…" />
        <main className="flex flex-1 flex-col gap-6 p-6">
          <p className="text-sm italic text-muted-foreground">Loading player…</p>
        </main>
      </>
    );
  }

  const starred = prefs.watchlist.includes(playerId);
  const inboundCount = msgs.filter((m) => m.direction === 'inbound').length;
  const workoutCount = msgs.filter((m) => m.category === 'workout').length;
  const rehabCount = msgs.filter((m) => m.category === 'rehab').length;
  const surveyReadings = msgs
    .filter((m) => m.category === 'survey' && m.body)
    .map((m) => {
      const match = /^(\d{1,2})/.exec(m.body!.trim());
      return match ? Number(match[1]) : null;
    })
    .filter((n): n is number => n !== null && n >= 1 && n <= 10);
  const avgReadiness = surveyReadings.length
    ? Math.round((surveyReadings.reduce((a, b) => a + b, 0) / surveyReadings.length) * 10) / 10
    : null;

  return (
    <>
      <PageHeader
        title={player.name}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge variant="secondary">{player.group ?? 'No group'}</Badge>
            <span className="text-xs text-muted-foreground">{prettyPhone(player.phone_e164)}</span>
          </span>
        }
        right={<StarButton playerId={playerId} initial={starred} />}
      />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Inbound messages" value={inboundCount} sub="last 50" icon={<MessageSquareText className="size-4" />} />
          <Metric label="Workouts" value={workoutCount} tone={workoutCount ? 'success' : 'default'} icon={<Dumbbell className="size-4" />} />
          <Metric label="Rehabs" value={rehabCount} tone={rehabCount ? 'warning' : 'default'} icon={<HeartPulse className="size-4" />} />
          <Metric label="Avg readiness" value={avgReadiness ?? '—'} sub={avgReadiness !== null ? `${surveyReadings.length} responses` : 'no surveys'} icon={<Heart className="size-4" />} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg">Recent messages</CardTitle>
            <CardDescription>{msgs.length} total</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {msgs.length === 0 ? (
              <p className="px-6 pb-6 text-sm italic text-muted-foreground">No messages yet.</p>
            ) : (
              <ScrollArea className="h-[440px]">
                <ul className="divide-y">
                  {msgs.map((m) => (
                    <li key={m.sid} className="px-6 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground tabular" title={prettyDateTime(m.date_sent)}>
                          {relativeTime(m.date_sent)}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{prettyDirection(m.direction)}</span>
                        <Badge variant={CAT_VARIANT[m.category] ?? 'outline'} className="text-[10px]">
                          {prettyCategory(m.category)}
                        </Badge>
                      </div>
                      {m.body && <div className="mt-1 text-sm leading-snug">{m.body}</div>}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg">Activity log</CardTitle>
            <CardDescription>{logs.length} entries</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {logs.length === 0 ? (
              <p className="px-6 text-sm italic text-muted-foreground">No historical activity logs for this player.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground" title={prettyDateTime(l.logged_at)}>{prettyDate(l.logged_at)}</TableCell>
                      <TableCell><Badge variant={l.kind === 'workout' ? 'default' : 'secondary'}>{prettyCategory(l.kind)}</Badge></TableCell>
                      <TableCell>{l.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
