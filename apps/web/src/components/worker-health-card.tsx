'use client';
import { useEffect, useState } from 'react';
import type { WorkerState } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { StatCell } from './v3/stat-cell';

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
  const ago = lastTwilio ? Math.round((Date.now() - lastTwilio.getTime()) / 1000) : null;
  const errors = state?.consecutive_errors ?? 0;
  const healthy = errors === 0 && ago !== null && ago < 900;

  const tone = errors > 0 ? 'red' : healthy ? 'green' : 'amber';
  const status = errors > 0 ? 'Errored' : healthy ? 'Healthy' : 'Stale';

  return (
    <StatCell
      label="Worker"
      value={status}
      tone={tone}
      sub={ago != null ? `last poll ${ago}s ago${errors ? ` · ${errors} err` : ''}` : 'no data'}
    />
  );
}
