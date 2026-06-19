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

      const [{ data: players }, { data: logs }] = await Promise.all([
        pq,
        sb
          .from('activity_logs')
          .select('player_id,logged_at')
          .eq('team_id', teamId)
          .eq('hidden', false)
          .gte('logged_at', since),
      ]);
      if (!alive) return;

      setRows(
        computeEngagement({
          players: (players ?? []) as EngagementPlayer[],
          logs: (logs ?? []) as EngagementLog[],
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
