'use client';

// Team-wide activity feed for the Competitions landing — restores the
// peer-visible "see each other's workouts + photos" experience that lived
// on the old /dashboard/fitness page. That page was deleted in 7d97e86
// ("merge Activity into Competitions"), which kept the leaderboard but
// dropped the per-athlete activity feed + uploaded photos.
//
// Team-scoped read (every teammate's workout/rehab), newest first, with
// inline photo thumbnails via TwilioMediaStrip. RLS on activity_logs and
// the twilio-media proxy are already team-scoped, so athletes can read
// teammates' rows + images — only this UI surface was missing.

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from '@/components/v3/pill';
import { TwilioMediaStrip } from '@/components/v3/twilio-media-strip';
import { stripProtocolPrefix } from '@/lib/timeline';
import { prettyCategory, prettyDate, relativeTime } from '@/lib/format';
import type { ActivityLog } from '@reflect-live/shared';
import { Users } from 'lucide-react';

const DAYS = 30;
const PAGE_SIZE = 25;

interface ActivityWithPlayer extends ActivityLog {
  player: { name: string; group: string | null } | null;
  source_sid: string | null;
  media_sids: string[] | null;
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function TeamActivityFeed({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [logs, setLogs] = useState<ActivityWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'all' | 'workout' | 'rehab'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString();
      const { data } = await sb
        .from('activity_logs')
        .select('*, player:players(name, group)')
        .eq('team_id', teamId)
        .in('kind', ['workout', 'rehab'])
        .eq('hidden', false)
        .gte('logged_at', since)
        .order('logged_at', { ascending: false })
        .limit(300);
      if (!alive) return;
      setLogs((data ?? []) as ActivityWithPlayer[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [sb, teamId]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [kindFilter]);

  const filtered = kindFilter === 'all' ? logs : logs.filter((l) => l.kind === kindFilter);
  const visible = filtered.slice(0, visibleCount);
  const hiddenCount = Math.max(0, filtered.length - visibleCount);

  return (
    <section className="reveal reveal-4 rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Users className="size-4" style={{ color: 'var(--blue)' }} />
          <h2 className="text-base font-bold text-[color:var(--ink)]">Team activity</h2>
          <span className="text-[11.5px] text-[color:var(--ink-mute)]">last {DAYS} days</span>
        </div>
        <nav
          className="inline-flex items-center gap-1 rounded-full border p-1"
          style={{ borderColor: 'var(--border)', background: 'var(--paper-2)' }}
          role="radiogroup"
          aria-label="Activity kind"
        >
          {(['all', 'workout', 'rehab'] as const).map((k) => {
            const on = kindFilter === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKindFilter(k)}
                className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition ${
                  on ? 'text-[color:var(--paper)]' : 'text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]'
                }`}
                style={on ? { background: 'var(--ink)' } : undefined}
              >
                {k === 'all' ? 'All' : prettyCategory(k)}
              </button>
            );
          })}
        </nav>
      </header>

      {loading ? (
        <div className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">loading…</div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-[13px] text-[color:var(--ink-mute)]">
          No team activity in the last {DAYS} days yet.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {visible.map((l) => {
            const name = l.player?.name ?? 'Unknown';
            return (
              <li key={l.id} className="flex items-start gap-3 px-6 py-3.5">
                <span
                  className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border bg-[color:var(--paper)] text-[10px] font-bold"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {l.player ? initials(name) : '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-[color:var(--ink)] truncate">{name}</span>
                    {l.player?.group && (
                      <span className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-dim)] truncate">{l.player.group}</span>
                    )}
                    <Pill tone={l.kind === 'workout' ? 'green' : 'amber'}>{prettyCategory(l.kind)}</Pill>
                    <span
                      className="ml-auto mono text-[11.5px] text-[color:var(--ink-mute)] tabular"
                      title={prettyDate(l.logged_at)}
                    >
                      {relativeTime(l.logged_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-start gap-3">
                    <span className="flex-1 min-w-0 text-[13.5px] leading-snug text-[color:var(--ink-soft)]">
                      {stripProtocolPrefix(l.description)}
                    </span>
                    <TwilioMediaStrip messageSid={l.source_sid} mediaSids={l.media_sids} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && hiddenCount > 0 && (
        <div
          className="flex items-center justify-between gap-3 px-6 py-3 border-t text-[12px]"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-[color:var(--ink-mute)] tabular">Showing {visible.length} of {filtered.length}</span>
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="rounded-md border px-3 py-1.5 text-[12px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] hover:border-[color:var(--blue)] transition"
            style={{ borderColor: 'var(--border)' }}
          >
            Show {Math.min(PAGE_SIZE, hiddenCount)} more
          </button>
        </div>
      )}
    </section>
  );
}
