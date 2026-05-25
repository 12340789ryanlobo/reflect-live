'use client';

// Athlete-page card: shows this player's standing in every active
// competition on their team. Calls /api/competitions to find live
// ones, then /api/competitions/[id] for the leaderboard so the
// athlete's rank is in the same payload as the points.
//
// Rendering is intentionally compact — one row per active
// competition, name + dates + (points / rank / N). Clicking the row
// goes to the competition detail page for the full leaderboard.
//
// Hidden entirely when no active competitions exist.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Competition } from '@reflect-live/shared';
import { Trophy } from 'lucide-react';

// Top-3 medals match the legacy reflect leaderboard look so athletes
// who used the old app recognize the rank affordance instantly.
const MEDALS = ['🥇', '🥈', '🥉'] as const;

interface Props {
  teamId: number;
  playerId: number;
}

interface Standing {
  competition: Competition;
  rank: number | null;        // null when this athlete isn't on the board yet
  total: number;
  points: number;
  base_points: number;
  bonus_total: number;
}

export function CompetitionStandingCard({ teamId, playerId }: Props) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const listRes = await fetch(`/api/competitions?team_id=${teamId}`, { cache: 'no-store' });
        if (!listRes.ok) { if (alive) setLoaded(true); return; }
        const { competitions = [] } = (await listRes.json()) as { competitions: Competition[] };

        const today = new Date().toISOString().slice(0, 10);
        const active = competitions.filter(
          (c) => !c.archived_at && c.starts_at <= today && today <= c.ends_at,
        );
        if (active.length === 0) {
          if (alive) setLoaded(true);
          return;
        }

        // Fetch the leaderboard for each in parallel. Few competitions
        // per team in practice, so we don't bother batching.
        const detailReses = await Promise.all(
          active.map((c) => fetch(`/api/competitions/${c.id}`, { cache: 'no-store' })),
        );
        const results: Standing[] = [];
        for (let i = 0; i < active.length; i++) {
          const r = detailReses[i];
          if (!r.ok) continue;
          const { leaderboard = [] } = (await r.json()) as {
            leaderboard: Array<{ player_id: number; points: number; base_points: number; bonus_total: number }>;
          };
          const idx = leaderboard.findIndex((row) => row.player_id === playerId);
          const me = idx === -1 ? null : leaderboard[idx];
          results.push({
            competition: active[i],
            rank: me ? idx + 1 : null,
            total: leaderboard.length,
            points: me?.points ?? 0,
            base_points: me?.base_points ?? 0,
            bonus_total: me?.bonus_total ?? 0,
          });
        }
        if (alive) {
          setStandings(results);
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [teamId, playerId]);

  if (!loaded || standings.length === 0) return null;

  return (
    <section className="reveal rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <header className="flex items-center gap-2 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <Trophy className="size-4" style={{ color: 'var(--blue)' }} />
        <h2 className="text-base font-bold text-[color:var(--ink)]">Active competitions</h2>
      </header>
      <ul>
        {standings.map((s) => {
          const medal = s.rank && s.rank <= 3 ? MEDALS[s.rank - 1] : null;
          // Days remaining for the urgency cue. Inclusive of today.
          const today = new Date().toISOString().slice(0, 10);
          const a = new Date(today + 'T00:00:00Z').getTime();
          const b = new Date(s.competition.ends_at + 'T00:00:00Z').getTime();
          const daysLeft = Math.max(0, Math.round((b - a) / 86_400_000) + 1);
          return (
          <li key={s.competition.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
            <Link
              href={`/dashboard/competitions/${s.competition.id}`}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-6 px-6 py-3.5 hover:bg-[color:var(--card-hover)] transition"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[14px] text-[color:var(--ink)]">{s.competition.name}</span>
                  <span className="inline-block size-1.5 rounded-full bg-[color:var(--green)] animate-pulse" aria-label="live" />
                </div>
                <div className="text-[11.5px] text-[color:var(--ink-mute)] mt-0.5">
                  {daysLeft} day{daysLeft === 1 ? '' : 's'} left · ends {s.competition.ends_at}
                </div>
              </div>
              <div className="text-right">
                <div className="tabular text-[22px] font-bold leading-none" style={{ color: 'var(--blue)' }}>
                  {s.points}
                </div>
                <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] mt-1">
                  pts
                  {s.bonus_total !== 0 && (
                    <span className="ml-1 mono" style={{ color: s.bonus_total > 0 ? 'var(--green)' : 'var(--red)' }}>
                      ({s.bonus_total > 0 ? '+' : ''}{s.bonus_total})
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right min-w-[88px]">
                <div className="tabular text-[22px] font-bold leading-none text-[color:var(--ink)] flex items-baseline justify-end gap-1">
                  {medal && <span className="text-[20px] leading-none">{medal}</span>}
                  {s.rank ? <span>{s.rank}</span> : <span className="text-[color:var(--ink-dim)]">—</span>}
                  {s.rank && <span className="text-[12px] font-normal text-[color:var(--ink-mute)]">/ {s.total}</span>}
                </div>
                <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] mt-1">rank</div>
              </div>
            </Link>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
