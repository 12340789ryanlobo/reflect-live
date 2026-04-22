'use client';
import { useEffect, useState } from 'react';
import type { WorkerState } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';

/**
 * WorkerHealthCard — a telemetry readout for the background worker.
 *
 * Uses StatReadout styling so it sits naturally in the top strip of stats.
 * Pulses chlorine when healthy, amber when stale, siren when erroring.
 */
export function WorkerHealthCard() {
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
  const mostRecent = [lastTwilio, lastWeather]
    .filter(Boolean)
    .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] as Date | undefined;
  const ago = mostRecent ? Math.round((Date.now() - mostRecent.getTime()) / 1000) : null;
  const errors = state?.consecutive_errors ?? 0;
  const healthy = errors === 0 && ago !== null && ago < 900;

  const tone: { color: string; border: string; bg: string; status: string } = errors > 0
    ? { color: 'hsl(356 82% 62%)', border: 'hsl(356 60% 42%)', bg: 'hsl(356 60% 20% / 0.3)', status: 'ERR' }
    : healthy
    ? { color: 'hsl(162 62% 54%)', border: 'hsl(162 40% 40%)', bg: 'hsl(162 40% 18% / 0.3)', status: 'OK' }
    : { color: 'hsl(38 90% 62%)', border: 'hsl(38 60% 42%)', bg: 'hsl(38 60% 20% / 0.3)', status: 'STALE' };

  return (
    <div className="relative flex flex-col gap-1.5 border-l border-[color:var(--hairline)] pl-4 py-2">
      <span
        className="absolute left-0 top-2 h-3 w-[2px]"
        style={{ background: tone.color }}
        aria-hidden
      />
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">Worker</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block size-2 rounded-full"
          style={{
            background: tone.color,
            boxShadow: `0 0 8px ${tone.color}, 0 0 0 3px ${tone.color}33`,
          }}
        />
        <span
          className="num-display text-[1.6rem] leading-none"
          style={{ color: tone.color }}
        >
          {tone.status}
        </span>
      </div>
      <div className="mono text-[0.7rem] text-[color:var(--bone-mute)] tracking-wider tabular">
        {ago != null ? `last poll ${ago}s ago` : 'no data'}
        {errors > 0 && ` · ${errors} err`}
      </div>
    </div>
  );
}
