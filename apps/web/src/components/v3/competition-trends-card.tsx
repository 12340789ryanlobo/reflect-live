'use client';

// Competition score trends — one ranked row per athlete with a
// [ Trajectory | Cadence ] toggle. Trajectory = cumulative-points sparkline;
// Cadence = per-bucket activity heatmap-strip. See
// docs/superpowers/specs/2026-06-18-competition-score-trends-design.md

import { useEffect, useMemo, useState } from 'react';
import type { Competition } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Sparkline } from '@/components/sparkline';
import { computeCompetitionSeries, type CompetitionSeriesRow } from '@/lib/scoring';
import { periodLabel, periodShortLabel, type Period } from '@/lib/period';

type View = 'trajectory' | 'cadence';

function shortDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function fmtPts(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

// Discrete red→amber→green tone scaled to this competition's per-bucket max.
function cadenceTone(v: number, max: number): string {
  if (v <= 0) return 'var(--border)';
  const r = max > 0 ? v / max : 1;
  if (r <= 1 / 3) return 'var(--red)';
  if (r <= 2 / 3) return 'var(--amber)';
  return 'var(--green)';
}

export function CompetitionTrendsCard({ competition }: { competition: Competition }) {
  const sb = useSupabase();
  const [view, setView] = useState<View>('trajectory');
  const [period, setPeriod] = useState<Period>('all');
  const [rows, setRows] = useState<CompetitionSeriesRow[]>([]);
  const [axis, setAxis] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { rows: nextRows, bucketAxis } = await computeCompetitionSeries(sb, competition, period);
      if (cancelled) return;
      setRows(nextRows);
      setAxis(bucketAxis);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, competition, period]);

  const cadenceMax = useMemo(
    () => rows.reduce((m, r) => Math.max(m, ...r.perBucket), 0),
    [rows],
  );

  return (
    <section
      className="reveal reveal-2 rounded-2xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-bold text-[color:var(--ink)]">Trends</h2>
          {period !== 'all' && (
            <span className="text-[11.5px] text-[color:var(--ink-mute)]">
              ranked by {periodLabel(period).toLowerCase()}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-lg border p-0.5 text-[12px] font-semibold"
            style={{ borderColor: 'var(--border)' }}
          >
            {([7, 30, 'all'] as Period[]).map((p) => (
              <button
                key={String(p)}
                type="button"
                onClick={() => setPeriod(p)}
                className="rounded-md px-3 py-1 transition"
                style={
                  period === p
                    ? { background: 'var(--ink)', color: 'var(--card)' }
                    : { color: 'var(--ink-mute)' }
                }
              >
                {p === 'all' ? 'Full' : periodShortLabel(p)}
              </button>
            ))}
          </div>
          <div
            className="inline-flex rounded-lg border p-0.5 text-[12px] font-semibold"
            style={{ borderColor: 'var(--border)' }}
          >
            {(['trajectory', 'cadence'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className="rounded-md px-3 py-1 capitalize transition"
                style={
                  view === v
                    ? { background: 'var(--blue)', color: 'white' }
                    : { color: 'var(--ink-mute)' }
                }
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
      ) : rows.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
          {period === 'all'
            ? '— no scored activity in this competition yet —'
            : `— no scored activity in the ${periodLabel(period).toLowerCase()} —`}
        </p>
      ) : (
        <div className="px-2 md:px-4 py-3">
          {rows.map((row, i) => (
            <div key={row.player_id} className="flex items-center gap-3 px-4 py-2">
              <span className="tabular w-6 text-center text-[13px] font-bold text-[color:var(--ink-mute)]">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[color:var(--ink)]">
                {row.name}
              </span>

              <div className="flex w-[200px] shrink-0 items-center justify-end">
                {view === 'trajectory' ? (
                  <Sparkline
                    data={row.cumulative}
                    width={180}
                    height={26}
                    stroke="var(--blue)"
                    fill="var(--blue)"
                    showDots
                  />
                ) : (
                  <div
                    className="grid w-[180px] gap-[1.5px]"
                    style={{
                      gridTemplateColumns: `repeat(${row.perBucket.length}, minmax(0, 1fr))`,
                      height: 22,
                    }}
                  >
                    {row.perBucket.map((v, b) => (
                      <div
                        key={b}
                        className="rounded-[2px]"
                        title={`${shortDate(axis[b] ?? '')}: ${fmtPts(v)} pt`}
                        style={{
                          background: cadenceTone(v, cadenceMax),
                          opacity: v <= 0 ? 0.4 : 0.92,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <span className="tabular w-14 shrink-0 text-right text-[14px] font-bold text-[color:var(--ink)]">
                {fmtPts(row.total)}
                <span className="ml-1 text-[11px] font-medium text-[color:var(--ink-mute)]">pt</span>
              </span>
            </div>
          ))}

          {axis.length > 1 && (
            <div className="flex items-center justify-between px-4 pt-1.5">
              <span className="ml-9 mono text-[10px] tabular text-[color:var(--ink-mute)]">
                {shortDate(axis[0])}
              </span>
              <span className="mono text-[10px] tabular text-[color:var(--ink-mute)]">
                {shortDate(axis[axis.length - 1])}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
