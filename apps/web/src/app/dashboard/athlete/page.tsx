'use client';
import { useEffect, useMemo, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Metric } from '@/components/metric-card';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, TwilioMessage, ActivityLog, Category } from '@reflect-live/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareText, Dumbbell, HeartPulse, Heart, LogOut } from 'lucide-react';
import { prettyCategory, prettyDate, prettyDateTime, prettyDirection, relativeTime } from '@/lib/format';

const CAT_VARIANT: Record<Category, React.ComponentProps<typeof Badge>['variant']> = {
  workout: 'default',
  rehab: 'secondary',
  survey: 'outline',
  chat: 'outline',
};

export default function AthletePage() {
  const { prefs, refresh } = useDashboard();
  const sb = useSupabase();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [me, setMe] = useState<Player | null>(null);
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [days, setDays] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: players } = await sb.from('players').select('*').eq('team_id', prefs.team_id).order('name');
      setAllPlayers((players ?? []) as Player[]);
      const playerId = prefs.impersonate_player_id;
      if (playerId) {
        const { data: playerData } = await sb.from('players').select('*').eq('id', playerId).single();
        setMe(playerData as Player);
      } else {
        setMe(null);
      }
    })();
  }, [sb, prefs.team_id, prefs.impersonate_player_id]);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const [{ data: m }, { data: l }] = await Promise.all([
        sb.from('twilio_messages')
          .select('*')
          .eq('player_id', me.id)
          .gte('date_sent', since)
          .order('date_sent', { ascending: false })
          .limit(100),
        sb.from('activity_logs')
          .select('*')
          .eq('player_id', me.id)
          .order('logged_at', { ascending: false })
          .limit(50),
      ]);
      setMsgs((m ?? []) as TwilioMessage[]);
      setLogs((l ?? []) as ActivityLog[]);
    })();
  }, [sb, me, days]);

  async function setAthlete(playerId: number | null) {
    setSaving(true);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: prefs.team_id,
        watchlist: prefs.watchlist,
        group_filter: prefs.group_filter,
        role: playerId ? 'athlete' : 'coach',
        impersonate_player_id: playerId,
      }),
    });
    setSaving(false);
    await refresh();
  }

  const inboundCount = msgs.filter((m) => m.direction === 'inbound').length;
  const workoutCount = msgs.filter((m) => m.category === 'workout').length;
  const rehabCount = msgs.filter((m) => m.category === 'rehab').length;
  const surveyReadings = useMemo(() => msgs
    .filter((m) => m.category === 'survey' && m.body)
    .map((m) => {
      const match = /^(\d{1,2})/.exec(m.body!.trim());
      return match ? Number(match[1]) : null;
    })
    .filter((n): n is number => n !== null && n >= 1 && n <= 10),
  [msgs]);
  const avgReadiness = surveyReadings.length
    ? Math.round((surveyReadings.reduce((a, b) => a + b, 0) / surveyReadings.length) * 10) / 10
    : null;

  const daysSub = days === 7 ? 'last 7 days' : days === 30 ? 'last 30 days' : days === 90 ? 'last 90 days' : `last ${days} days`;

  // Picker — no impersonation set yet
  if (!me) {
    return (
      <>
        <PageHeader title="Athlete view" subtitle="Pick a player to simulate" />
        <main className="flex flex-1 flex-col gap-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">About athlete view</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pick a player to view the dashboard as them. This is a <strong>simulation</strong> — the athlete sees only their own messages, workouts, and readiness. Useful for showing a captain what their check-in page looks like, or testing what a player&apos;s view feels like.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">Pick a player ({allPlayers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {allPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setAthlete(p.id)}
                    disabled={saving}
                    className="flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/5 transition disabled:opacity-50"
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.group ?? 'No group'}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Welcome, ${me.name}`}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge variant="secondary">Athlete view</Badge>
            <span className="text-muted-foreground">{me.group ?? 'No group'}</span>
          </span>
        }
        right={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setAthlete(null)} disabled={saving}>
              <LogOut className="size-4" />
              Exit athlete view
            </Button>
          </div>
        }
      />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="My messages" value={inboundCount} sub={daysSub} icon={<MessageSquareText className="size-4" />} />
          <Metric label="My workouts" value={workoutCount} sub={daysSub} tone={workoutCount ? 'success' : 'default'} icon={<Dumbbell className="size-4" />} />
          <Metric label="My rehabs" value={rehabCount} sub={daysSub} tone={rehabCount ? 'warning' : 'default'} icon={<HeartPulse className="size-4" />} />
          <Metric label="Avg readiness" value={avgReadiness ?? '—'} sub={avgReadiness !== null ? `${surveyReadings.length} responses` : 'no surveys'} icon={<Heart className="size-4" />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2" id="messages">
          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">My recent messages</CardTitle>
              <CardDescription>{msgs.length} total</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {msgs.length === 0 ? (
                <p className="px-6 pb-6 text-sm italic text-muted-foreground">No messages yet in this period.</p>
              ) : (
                <ScrollArea className="h-[420px]">
                  <ul className="divide-y">
                    {msgs.slice(0, 25).map((m) => (
                      <li key={m.sid} className="px-6 py-3">
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                          <span className="tabular" title={prettyDateTime(m.date_sent)}>{relativeTime(m.date_sent)}</span>
                          <span>·</span>
                          <span>{prettyDirection(m.direction)}</span>
                          <Badge variant={CAT_VARIANT[m.category]} className="ml-1 text-[10px]">{prettyCategory(m.category)}</Badge>
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
              <CardTitle className="h-serif text-lg">My activity log</CardTitle>
              <CardDescription>{logs.length} entries</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <p className="px-6 pb-6 text-sm italic text-muted-foreground">No historical activity logs yet.</p>
              ) : (
                <ScrollArea className="h-[420px]">
                  <ul className="divide-y">
                    {logs.slice(0, 25).map((l) => (
                      <li key={l.id} className="px-6 py-3">
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                          <span className="tabular">{prettyDate(l.logged_at)}</span>
                          <Badge variant={l.kind === 'workout' ? 'default' : 'secondary'} className="ml-1 text-[10px]">{prettyCategory(l.kind)}</Badge>
                        </div>
                        {l.description && <div className="mt-1 text-sm leading-snug">{l.description}</div>}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
