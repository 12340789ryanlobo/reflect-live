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
//
// Presented as a fixed-height, internally scrolling card so the feed stays
// a contained, digestible box on the page rather than stretching it.

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from '@/components/v3/pill';
import { TwilioMediaStrip } from '@/components/v3/twilio-media-strip';
import { stripProtocolPrefix } from '@/lib/timeline';
import { prettyCategory, prettyDate, relativeTime } from '@/lib/format';
import type { ActivityLog } from '@reflect-live/shared';
import { Users } from 'lucide-react';

const DAYS = 30;

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

  const filtered = kindFilter === 'all' ? logs : logs.filter((l) => l.kind === kindFilter);
  const athletes = new Set(filtered.map((l) => l.player_id)).size;
  // Rough "does it overflow the scroll box" heuristic — drives the bottom
  // fade cue. A text-only row is ~64px, so ~6 rows fill the 520px box.
  const overflowing = filtered.length > 6;

  return (
    <section
      className="reveal reveal-4 rounded-2xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg" style={{ background: 'var(--blue-soft, var(--paper-2))' }}>
            <Users className="size-4" style={{ color: 'var(--blue)' }} />
          </span>
          <div>
            <h2 className="text-base font-bold leading-tight text-[color:var(--ink)]">Team activity</h2>
            <p className="text-[11.5px] leading-tight text-[color:var(--ink-mute)]">
              {loading
                ? 'loading…'
                : filtered.length === 0
                  ? `last ${DAYS} days`
                  : `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'} · ${athletes} ${athletes === 1 ? 'athlete' : 'athletes'} · last ${DAYS} days`}
            </p>
          </div>
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
        <div className="px-6 py-12 text-center text-[13px] text-[color:var(--ink-mute)]">loading…</div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-14 text-center text-[13px] text-[color:var(--ink-mute)]">
          No team activity in the last {DAYS} days yet. Logged workouts and rehabs show up here.
        </div>
      ) : (
        <div className="relative">
          <ul className="max-h-[520px] overflow-y-auto overscroll-contain divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map((l) => {
              const name = l.player?.name ?? 'Unknown';
              const hasMedia = !!(l.source_sid && l.media_sids && l.media_sids.length > 0);
              return (
                <li key={l.id} className="flex items-start gap-3 px-6 py-3.5 transition hover:bg-[color:var(--card-hover)]">
                  <span
                    className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border text-[11px] font-bold text-[color:var(--ink-soft)]"
                    style={{ borderColor: 'var(--border)', background: 'var(--paper)' }}
                  >
                    {l.player ? initials(name) : '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-[color:var(--ink)] truncate">{name}</span>
                      {l.player?.group && (
                        <span className="hidden sm:inline text-[10.5px] uppercase tracking-wide text-[color:var(--ink-dim)] truncate">
                          {l.player.group}
                        </span>
                      )}
                      <Pill tone={l.kind === 'workout' ? 'green' : 'amber'}>{prettyCategory(l.kind)}</Pill>
                      <span
                        className="ml-auto shrink-0 mono text-[11.5px] text-[color:var(--ink-mute)] tabular"
                        title={prettyDate(l.logged_at)}
                      >
                        {relativeTime(l.logged_at)}
                      </span>
                    </div>
                    {stripProtocolPrefix(l.description) && (
                      <p className="mt-1 text-[13.5px] leading-snug text-[color:var(--ink-soft)] whitespace-pre-wrap break-words">
                        {stripProtocolPrefix(l.description)}
                      </p>
                    )}
                    {hasMedia && (
                      <TwilioMediaStrip
                        messageSid={l.source_sid}
                        mediaSids={l.media_sids}
                        maxInline={4}
                        className="mt-2"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {/* Fade cue that there's more to scroll. */}
          {overflowing && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
              style={{ background: 'linear-gradient(to top, var(--card), transparent)' }}
            />
          )}
        </div>
      )}
    </section>
  );
}
