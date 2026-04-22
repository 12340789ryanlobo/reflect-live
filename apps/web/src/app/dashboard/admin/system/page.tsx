'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
import { useSupabase } from '@/lib/supabase-browser';
import type { WorkerState } from '@reflect-live/shared';
import { prettyDateTime } from '@/lib/format';

function secondsAgo(d: Date | null): number | null {
  if (!d) return null;
  return Math.round((Date.now() - d.getTime()) / 1000);
}

function fmtAgo(s: number | null): string {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
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
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sb]);

  const lastTwilio = state?.last_twilio_poll_at ? new Date(state.last_twilio_poll_at) : null;
  const lastWeather = state?.last_weather_poll_at ? new Date(state.last_weather_poll_at) : null;
  const errors = state?.consecutive_errors ?? 0;
  const healthy = errors === 0 && lastTwilio && Date.now() - lastTwilio.getTime() < 120_000;
  const status = errors > 0 ? 'flag' : healthy ? 'on' : 'watch';
  const statusText = errors > 0 ? 'errored' : healthy ? 'healthy' : 'stale';

  return (
    <>
      <PageHeader
        eyebrow="System telemetry"
        title="System"
        italic="telemetry."
        subtitle="WORKER · POLL · ERRORS"
        live
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* Status strip */}
        <section className="reveal reveal-1 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag
              name="Status"
              right={<Stamp tone={status}>{statusText}</Stamp>}
            />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 md:grid-cols-4">
            <StatReadout
              label="Status"
              value={healthy ? 'OK' : errors > 0 ? 'ERR' : 'STALE'}
              sub={errors === 0 ? 'NO ERRORS' : `${errors} CONSECUTIVE`}
              tone={healthy ? 'chlorine' : errors > 0 ? 'siren' : 'amber'}
            />
            <StatReadout
              label="Twilio poll"
              value={fmtAgo(secondsAgo(lastTwilio))}
              sub="EVERY 15S"
              tone="signal"
            />
            <StatReadout
              label="Weather poll"
              value={fmtAgo(secondsAgo(lastWeather))}
              sub="EVERY 10M"
              tone="heritage"
            />
            <StatReadout
              label="Backfill"
              value={state?.backfill_complete ? 'Done' : 'Pending'}
              sub="HISTORICAL IMPORT"
              tone={state?.backfill_complete ? 'chlorine' : 'default'}
            />
          </div>
        </section>

        {/* Last polls */}
        <section className="reveal reveal-2 panel p-5">
          <SectionTag name="Last polls" />
          <dl className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[200px_1fr] md:gap-y-2 md:gap-x-6">
            <Row label="Twilio poll" value={lastTwilio ? prettyDateTime(lastTwilio) : '—'} />
            <Row label="Weather poll" value={lastWeather ? prettyDateTime(lastWeather) : '—'} />
            <Row label="Last date_sent cursor" value={state?.last_date_sent ?? '—'} mono />
          </dl>
        </section>

        {/* Errors */}
        <section className="reveal reveal-3 panel p-5">
          <SectionTag name="Errors" />
          <dl className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[200px_1fr] md:gap-y-2 md:gap-x-6">
            <Row
              label="Consecutive errors"
              value={
                <span
                  className="num-display text-xl"
                  style={{ color: errors > 0 ? 'hsl(356 82% 62%)' : 'hsl(162 62% 54%)' }}
                >
                  {errors}
                </span>
              }
            />
            <Row
              label="Last error"
              value={state?.last_error ?? <span className="text-[color:var(--bone-mute)]">— none —</span>}
              mono
            />
          </dl>
        </section>

        {/* Backfill */}
        <section className="reveal reveal-4 panel p-5">
          <SectionTag name="Backfill" />
          <p className="mt-4 text-sm text-[color:var(--bone-soft)] leading-relaxed">
            Backfill is{' '}
            {state?.backfill_complete ? (
              <Stamp tone="on">complete</Stamp>
            ) : (
              <Stamp tone="watch">in progress</Stamp>
            )}
            .{' '}
            <span className="text-[color:var(--bone-mute)]">
              The worker walks Twilio history backwards on startup until it reaches a sentinel, then
              switches to the forward 15s loop.
            </span>
          </p>
        </section>
      </main>
    </>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)] md:py-1">
        {label}
      </dt>
      <dd
        className={`text-[color:var(--bone)] md:py-1 ${mono ? 'mono text-xs' : 'text-sm'}`}
      >
        {value}
      </dd>
    </>
  );
}
