'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSupabase } from '@/lib/supabase-browser';
import { useEngagement } from '@/lib/use-engagement';
import { Pill } from './pill';
import { relativeTime } from '@/lib/format';

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

type Reason = 'low' | 'quiet';

interface Flagged {
  player_id: number;
  name: string;
  group: string | null;
  reason: Reason;
  readiness: number | null;
  lastActive: string | null;
  severity: number;
}

export function NeedsAttention({
  teamId,
  windowDays = 7,
  groupFilter = null,
}: {
  teamId: number;
  windowDays?: number | null;
  groupFilter?: string | null;
}) {
  const sb = useSupabase();
  const { rows, loading: engLoading } = useEngagement(teamId, windowDays, groupFilter);
  const [readiness, setReadiness] = useState<Map<number, number>>(new Map());
  const [readyLoading, setReadyLoading] = useState(true);

  // Latest survey readiness per player (last 7d) — a separate, acute signal.
  useEffect(() => {
    let alive = true;
    (async () => {
      setReadyLoading(true);
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data: msgs } = await sb
        .from('twilio_messages')
        .select('player_id,category,body,date_sent')
        .eq('team_id', teamId)
        .eq('hidden', false)
        .eq('category', 'survey')
        .gte('date_sent', since)
        .order('date_sent', { ascending: false });
      if (!alive) return;
      const latest = new Map<number, number>();
      for (const m of (msgs ?? []) as Array<{ player_id: number | null; body: string | null }>) {
        if (m.player_id == null || latest.has(m.player_id) || !m.body) continue;
        const match = /^(\d{1,2})/.exec(m.body.trim());
        if (match) {
          const n = Number(match[1]);
          if (n >= 1 && n <= 10) latest.set(m.player_id, n);
        }
      }
      setReadiness(latest);
      setReadyLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, teamId]);

  const loading = engLoading || readyLoading;

  // Build the act-now list: low readiness (highest priority) + quiet regulars.
  const flagged: Flagged[] = [];
  for (const r of rows) {
    const read = readiness.get(r.player_id) ?? null;
    if (read != null && read <= 4) {
      flagged.push({
        player_id: r.player_id, name: r.name, group: r.group, reason: 'low',
        readiness: read, lastActive: r.lastActive, severity: 10_000 + (100 - read * 10),
      });
    } else if (r.bucket === 'quiet') {
      flagged.push({
        player_id: r.player_id, name: r.name, group: r.group, reason: 'quiet',
        readiness: read, lastActive: r.lastActive, severity: r.severity,
      });
    }
  }
  flagged.sort((a, b) => b.severity - a.severity);

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold text-[color:var(--ink)]">Needs attention</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{flagged.length}</span>
      </header>
      {loading ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
      ) : flagged.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
          — everyone&rsquo;s on the wire —
        </p>
      ) : (
        <ul>
          {flagged.slice(0, 8).map((f) => (
            <li key={f.player_id}>
              <Link
                href={`/dashboard/players/${f.player_id}`}
                className="flex items-center gap-3 border-b px-6 py-3 transition hover:bg-[color:var(--card-hover)] last:border-b-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <span
                  className="grid size-8 place-items-center rounded-md border bg-[color:var(--paper)] text-[10.5px] font-bold text-[color:var(--ink-soft)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {initials(f.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[color:var(--ink)] truncate">{f.name}</div>
                  <div className="text-[11.5px] text-[color:var(--ink-mute)] truncate">
                    {f.group ?? 'No group'}
                    {f.reason === 'quiet'
                      ? f.lastActive
                        ? ` · last logged ${relativeTime(f.lastActive)}`
                        : ' · no logs'
                      : f.lastActive
                        ? ` · last logged ${relativeTime(f.lastActive)}`
                        : ''}
                  </div>
                </div>
                {f.reason === 'low' && f.readiness != null ? (
                  <Pill tone="red">readiness {f.readiness}</Pill>
                ) : (
                  <Pill tone="amber">quiet</Pill>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
