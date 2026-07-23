'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from './supabase-browser';
import {
  computeEngagement,
  type EngagementRow,
  type EngagementPlayer,
  type EngagementLog,
} from './engagement';

const DAY_MS = 24 * 3600 * 1000;
const BASELINE_WINDOWS = 4;

// Fetches active roster + recent activity_logs (RLS-scoped to the team) and
// runs the pure engine. Window null = "all"; we then pull a wide history.
export function useEngagement(
  teamId: number,
  windowDays: number | null,
  groupFilter: string | null,
) {
  const sb = useSupabase();
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const now = Date.now();
      // Cover the window plus the 4 baseline windows before it.
      const spanDays = windowDays == null ? 3650 : windowDays * (BASELINE_WINDOWS + 1);
      const since = new Date(now - spanDays * DAY_MS).toISOString();

      const pq = sb
        .from('players')
        .select('id,name,group')
        .eq('team_id', teamId)
        .eq('active', true);
      if (groupFilter) pq.eq('group', groupFilter);

      const { data: players } = await pq;

      // Page through activity_logs — supabase caps a query at 1000 rows, and a
      // team's baseline window (up to ~10 years) can exceed that; without this
      // the older logs are silently dropped and every baseline is computed from
      // truncated data (same reason scoring.ts paginates the identical query).
      const logs: EngagementLog[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await sb
          .from('activity_logs')
          .select('player_id,logged_at')
          .eq('team_id', teamId)
          .eq('hidden', false)
          .gte('logged_at', since)
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        logs.push(...(data as EngagementLog[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (!alive) return;

      setRows(
        computeEngagement({
          players: (players ?? []) as EngagementPlayer[],
          logs,
          windowDays,
          now,
        }),
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, teamId, windowDays, groupFilter]);

  return { rows, loading };
}
