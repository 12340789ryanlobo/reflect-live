'use client';
import { useEffect, useState } from 'react';
import type { WorkerState } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Metric } from './metric-card';
import { Heart } from 'lucide-react';

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
    return () => { alive = false; clearInterval(id); };
  }, [sb]);

  const lastTwilio = state?.last_twilio_poll_at ? new Date(state.last_twilio_poll_at) : null;
  const lastWeather = state?.last_weather_poll_at ? new Date(state.last_weather_poll_at) : null;
  const mostRecent = [lastTwilio, lastWeather].filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] as Date | undefined;
  const ago = mostRecent ? Math.round((Date.now() - mostRecent.getTime()) / 1000) : null;
  const healthy = state?.consecutive_errors === 0 && ago !== null && ago < 900;
  return (
    <Metric
      label="Worker"
      value={healthy ? 'Healthy' : 'Check'}
      sub={ago !== null ? `last poll ${ago}s ago` : 'no data'}
      tone={healthy ? 'success' : 'warning'}
      icon={<Heart className="size-4" />}
    />
  );
}
