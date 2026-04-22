'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { Metric } from '@/components/metric-card';
import { useSupabase } from '@/lib/supabase-browser';
import type { WorkerState } from '@reflect-live/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, CheckCircle2, Cloud, MessageSquareText } from 'lucide-react';
import { prettyDateTime } from '@/lib/format';

function secondsAgo(d: Date | null): number | null {
  if (!d) return null;
  return Math.round((Date.now() - d.getTime()) / 1000);
}

function fmtAgo(s: number | null): string {
  if (s == null) return '—';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default function AdminSystemPage() {
  const sb = useSupabase();
  const [state, setState] = useState<WorkerState | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      const { data } = await sb.from('worker_state').select('*').eq('id', 1).maybeSingle();
      if (alive && data) setState(data as WorkerState);
    }
    tick();
    const id = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, [sb]);

  const lastTwilio = state?.last_twilio_poll_at ? new Date(state.last_twilio_poll_at) : null;
  const lastWeather = state?.last_weather_poll_at ? new Date(state.last_weather_poll_at) : null;
  const errors = state?.consecutive_errors ?? 0;
  const healthy = errors === 0 && lastTwilio && (Date.now() - lastTwilio.getTime()) < 120_000;

  return (
    <>
      <PageHeader title="System" subtitle={<Badge variant="destructive">Admin only</Badge>} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric
            label="Status"
            value={healthy ? 'Healthy' : 'Check'}
            sub={errors === 0 ? 'no errors' : `${errors} consecutive errors`}
            tone={healthy ? 'success' : 'warning'}
            icon={healthy ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          />
          <Metric label="Twilio poll" value={fmtAgo(secondsAgo(lastTwilio))} sub="every 15s" tone="primary" icon={<MessageSquareText className="size-4" />} />
          <Metric label="Weather poll" value={fmtAgo(secondsAgo(lastWeather))} sub="every 10m" icon={<Cloud className="size-4" />} />
          <Metric label="Backfill" value={state?.backfill_complete ? 'Done' : 'Pending'} sub="historical import" tone={state?.backfill_complete ? 'success' : 'default'} icon={<Activity className="size-4" />} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg">Last polls</CardTitle>
            <CardDescription>Worker loop timestamps</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[200px_1fr] gap-y-2 text-sm">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Twilio poll</dt>
              <dd>{lastTwilio ? prettyDateTime(lastTwilio) : '—'}</dd>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Weather poll</dt>
              <dd>{lastWeather ? prettyDateTime(lastWeather) : '—'}</dd>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Last date_sent cursor</dt>
              <dd className="font-mono text-xs">{state?.last_date_sent ?? '—'}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg">Errors</CardTitle>
            <CardDescription>Consecutive failures + last message</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[200px_1fr] gap-y-2 text-sm">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Consecutive errors</dt>
              <dd><Badge variant={errors > 0 ? 'destructive' : 'secondary'}>{errors}</Badge></dd>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Last error</dt>
              <dd className="font-mono text-xs">{state?.last_error ?? <span className="text-muted-foreground">none</span>}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg">Backfill</CardTitle>
            <CardDescription>Historical message import state</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Backfill is{' '}
              {state?.backfill_complete
                ? <Badge variant="default">complete</Badge>
                : <Badge variant="secondary">in progress</Badge>}
              .
              <span className="ml-2 text-muted-foreground">
                The worker walks Twilio history backwards on startup until it reaches a sentinel, then switches to the forward 15s loop.
              </span>
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
