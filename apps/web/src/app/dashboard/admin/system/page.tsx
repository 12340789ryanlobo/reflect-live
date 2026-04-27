'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { Pill } from '@/components/v3/pill';
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

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] py-1">{label}</dt>
      <dd className={`py-1 text-[color:var(--ink)] ${mono ? 'mono text-[12px]' : 'text-[14px]'}`}>{value}</dd>
    </>
  );
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
  const statusTone: 'red' | 'green' | 'amber' = errors > 0 ? 'red' : healthy ? 'green' : 'amber';
  const statusText = errors > 0 ? 'errored' : healthy ? 'healthy' : 'stale';

  return (
    <>
      <PageHeader
        eyebrow="Worker health"
        title="System"
        subtitle="Polls · errors · backfill"
        live
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Status strip */}
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Status</h2>
            <Pill tone={statusTone}>{statusText}</Pill>
          </header>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6">
              <StatCell
                label="Status"
                value={healthy ? 'OK' : errors > 0 ? 'ERR' : 'STALE'}
                sub={errors === 0 ? 'no errors' : `${errors} consecutive`}
                tone={healthy ? 'green' : errors > 0 ? 'red' : 'amber'}
              />
            </div>
            <div className="p-6">
              <StatCell label="Twilio poll" value={fmtAgo(secondsAgo(lastTwilio))} sub="every 15s" tone="blue" />
            </div>
            <div className="p-6">
              <StatCell label="Weather poll" value={fmtAgo(secondsAgo(lastWeather))} sub="every 10m" />
            </div>
            <div className="p-6">
              <StatCell
                label="Backfill"
                value={state?.backfill_complete ? 'Done' : 'Pending'}
                sub="historical import"
                tone={state?.backfill_complete ? 'green' : 'default'}
              />
            </div>
          </div>
        </section>

        {/* Last polls */}
        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold text-[color:var(--ink)] mb-4">Last polls</h2>
          <dl className="grid grid-cols-1 gap-2 md:grid-cols-[200px_1fr] md:gap-y-1 md:gap-x-6">
            <Row label="Twilio poll" value={lastTwilio ? prettyDateTime(lastTwilio) : '—'} />
            <Row label="Weather poll" value={lastWeather ? prettyDateTime(lastWeather) : '—'} />
            <Row label="Last date_sent cursor" value={state?.last_date_sent ?? '—'} mono />
          </dl>
        </section>

        {/* Errors */}
        <section className="reveal reveal-3 rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold text-[color:var(--ink)] mb-4">Errors</h2>
          <dl className="grid grid-cols-1 gap-2 md:grid-cols-[200px_1fr] md:gap-y-1 md:gap-x-6">
            <Row
              label="Consecutive errors"
              value={
                <span
                  className="text-xl font-bold tabular"
                  style={{ color: errors > 0 ? 'var(--red)' : 'var(--green)' }}
                >
                  {errors}
                </span>
              }
            />
            <Row
              label="Last error"
              value={state?.last_error ?? <span className="text-[color:var(--ink-mute)]">— none —</span>}
              mono
            />
          </dl>
        </section>

        {/* Backfill */}
        <section className="reveal reveal-4 rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold text-[color:var(--ink)] mb-4">Backfill</h2>
          <p className="text-[14px] text-[color:var(--ink)] leading-relaxed">
            Backfill is{' '}
            {state?.backfill_complete ? (
              <Pill tone="green">complete</Pill>
            ) : (
              <Pill tone="amber">in progress</Pill>
            )}
            .{' '}
            <span className="text-[color:var(--ink-mute)]">
              The worker walks Twilio history backwards on startup until it reaches a sentinel, then
              switches to the forward 15s loop.
            </span>
          </p>
        </section>
      </main>
    </>
  );
}
