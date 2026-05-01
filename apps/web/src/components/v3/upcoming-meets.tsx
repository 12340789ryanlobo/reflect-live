'use client';

// Compact "Next meets" card. Shows up to N upcoming meet locations
// (kind='meet', event_date >= today) for a team, with days-until +
// the formatted event date. Used on the individual athlete page so
// athletes see what's coming without leaving the page; the coach
// dashboards have their own variants.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase-browser';
import { prettyDate } from '@/lib/format';
import type { Location } from '@reflect-live/shared';

interface Props {
  teamId: number;
  /** Max meets to show. Defaults to 3. */
  limit?: number;
  /** Visible only when there's at least one upcoming meet — set false
   *  to render an empty-state card instead of nothing. */
  hideWhenEmpty?: boolean;
}

interface MeetRow extends Location {
  daysUntil: number;
}

export function UpcomingMeets({ teamId, limit = 3, hideWhenEmpty = true }: Props) {
  const sb = useSupabase();
  const [meets, setMeets] = useState<MeetRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await sb
        .from('locations')
        .select('*')
        .eq('team_id', teamId)
        .eq('kind', 'meet');
      if (!alive) return;
      const rows = ((data ?? []) as Location[])
        .filter((l) => l.event_date)
        .map((l) => ({
          ...l,
          daysUntil: Math.round((new Date(l.event_date!).getTime() - Date.now()) / 86400000),
        }))
        .filter((l) => l.daysUntil >= 0)
        .sort((a, b) => a.daysUntil - b.daysUntil)
        .slice(0, limit);
      setMeets(rows);
    })();
    return () => { alive = false; };
  }, [sb, teamId, limit]);

  if (meets == null) return null;
  if (meets.length === 0 && hideWhenEmpty) return null;

  return (
    <section
      className="reveal reveal-3 rounded-2xl bg-[color:var(--card)] border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-bold text-[color:var(--ink)]">Next meets</h2>
        <Link
          href="/dashboard/events"
          className="text-[12px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition"
        >
          Schedule →
        </Link>
      </header>
      {meets.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
          — nothing on the calendar yet —
        </p>
      ) : (
        <div
          className="grid gap-0 md:grid-cols-3 divide-x"
          style={{ borderColor: 'var(--border)' }}
        >
          {meets.map((m) => (
            <div key={m.id} className="p-5">
              <div className="text-[14px] font-semibold text-[color:var(--ink)] line-clamp-2">
                {m.name}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[2.2rem] font-bold leading-none tabular text-[color:var(--ink)]">
                  {m.daysUntil}
                </span>
                <span className="text-[13px] text-[color:var(--ink-mute)]">d</span>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-dim)] mt-0.5">
                until {prettyDate(m.event_date!)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
