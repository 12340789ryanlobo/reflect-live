'use client';

// Single unified score-trends chart for an athlete. Inspired by the
// original reflect Chart.js view — score (0-10) questions render as
// lines on the main y-axis, binary yes/no questions as a count band
// below. Putting them on the same time axis lets a coach correlate
// across signals ("pain spike → readiness drop") at a glance.
//
// Design principles applied (from common multi-line time-series
// guidance — Cleveland, Tufte, Few):
//   - Cap visible series to ~5; more than that is illegible. Extras
//     start hidden and the user opts them in via the legend.
//   - Straight lines, not aggressive cubic bezier. Smoothing implies a
//     continuous underlying signal that interpolates between samples
//     — readiness today doesn't smoothly morph to readiness in 3
//     days. Honest > pretty.
//   - Binary questions are clamped to {0,1} and rendered as count
//     dots in their own band — never as a line that swoops 0→6→0.
//   - Distinct hues that don't blur into each other on a cream
//     background. Direct-labeled lines preferred but legend works.

import { useMemo, useState } from 'react';
import type { QuestionTrend, TrendPoint } from '@/lib/survey-trends';

interface Props {
  trends: QuestionTrend[];
  /** How many series to show by default; rest start hidden. */
  initialVisible?: number;
}

const PALETTE = [
  '#2563eb', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
];

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Strip trailing scaffolding for the legend label so 'Did any pain or
// physical issue start or get worse during practice today? Reply: 0 =
// no, 1 = yes' becomes 'Did any pain start or get worse during
// practice today?'.
function shortQuestionLabel(q: string, max = 38): string {
  let s = q.replace(/\bReply\b.*$/i, '').trim();
  s = s.replace(/\(.*\)\s*$/, '').trim();
  const firstQ = s.indexOf('?');
  if (firstQ !== -1 && firstQ < max + 6) s = s.slice(0, firstQ + 1);
  if (s.length > max) s = s.slice(0, max - 1).trim() + '…';
  return s;
}

interface Prepared {
  key: string;
  label: string;
  full: string;
  color: string;
  isBinary: boolean;
  points: TrendPoint[];
  // For binary questions: clamp anything ≥0.5 to 1 (athletes who
  // typed a severity "6" for a yes/no question still mean "yes").
  binaryPoints: TrendPoint[];
  count: number;
}

export function SurveyTrendsCard({ trends, initialVisible = 5 }: Props) {
  const series = useMemo<Prepared[]>(() => {
    // Sort by reply count desc — most-data questions get priority
    // colors and visibility.
    const sorted = [...trends].sort((a, b) => b.points.length - a.points.length);
    return sorted.map((t, i) => {
      const isBinary = t.kind === 'binary';
      const binaryPoints = isBinary
        ? t.points.map((p) => ({ ts: p.ts, score: p.score >= 0.5 ? 1 : 0 }))
        : t.points;
      return {
        key: t.key,
        label: shortQuestionLabel(t.question),
        full: t.question,
        color: PALETTE[i % PALETTE.length],
        isBinary,
        points: t.points,
        binaryPoints,
        count: t.points.length,
      };
    });
  }, [trends]);

  // Default visibility: top N by reply count are on, rest are off.
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const s = new Set<string>();
    series.slice(initialVisible).forEach((x) => s.add(x.key));
    return s;
  });
  const visible = series.filter((s) => !hidden.has(s.key));

  // Domain — only over visible series, so toggling the legend re-fits
  // the axis sensibly.
  const allTs: number[] = [];
  for (const s of visible) for (const p of s.points) allTs.push(new Date(p.ts).getTime());
  const tMin = allTs.length ? Math.min(...allTs) : 0;
  const tMax = allTs.length ? Math.max(...allTs) : 1;
  const tRange = Math.max(tMax - tMin, 1);

  const scoreSeries = visible.filter((s) => !s.isBinary);
  const binarySeries = visible.filter((s) => s.isBinary);

  // Layout
  const W = 760;
  const PAD_L = 28;
  const PAD_R = 16;
  const PAD_T = 14;
  const PAD_B = 26;
  const SCORE_H = 220;
  const BAND_ROW_H = 18;
  const BAND_GAP = binarySeries.length ? 16 : 0;
  const BAND_H = binarySeries.length ? binarySeries.length * BAND_ROW_H : 0;
  const H = PAD_T + SCORE_H + BAND_GAP + BAND_H + PAD_B;

  const innerW = W - PAD_L - PAD_R;
  const xOf = (ts: string) =>
    PAD_L + ((new Date(ts).getTime() - tMin) / tRange) * innerW;
  const yScore = (v: number) => PAD_T + ((10 - v) / 10) * SCORE_H;

  // X-axis ticks — 5 evenly spaced labels reads cleaner than 6 at
  // 760px wide. 'autoSkip'-equivalent below.
  const TICK_COUNT = 5;

  if (trends.length === 0) {
    return (
      <section
        className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden"
        style={{ borderColor: 'var(--border)' }}
      >
        <header
          className="flex items-center justify-between gap-3 px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-base font-bold text-[color:var(--ink)]">Score trends</h2>
          <span className="text-[11.5px] text-[color:var(--ink-mute)] tabular">0 questions</span>
        </header>
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--ink-mute)]">
            — no survey replies in this window —
          </p>
          <p className="mt-1 text-[11.5px] text-[color:var(--ink-mute)]">
            Replies that look like a 0–10 score will plot here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-bold text-[color:var(--ink)]">Score trends</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)] tabular">
          {visible.length} of {series.length} {series.length === 1 ? 'question' : 'questions'} shown
        </span>
      </header>

      <div className="px-4 md:px-6 py-5">
        {visible.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-[color:var(--ink-mute)]">
            All series hidden — toggle one back on below.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            preserveAspectRatio="none"
          >
            {/* Y-axis labels + horizontal gridlines */}
            {[0, 5, 10].map((v) => (
              <g key={`y-${v}`}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={yScore(v)}
                  y2={yScore(v)}
                  stroke="var(--border)"
                  strokeWidth={0.5}
                  strokeDasharray={v === 5 ? '2 3' : undefined}
                />
                <text
                  x={PAD_L - 6}
                  y={yScore(v) + 3}
                  textAnchor="end"
                  style={{ fontSize: 10, fill: 'var(--ink-mute)' }}
                  className="mono tabular"
                >
                  {v}
                </text>
              </g>
            ))}

            {/* Score lines — straight, no smoothing. Each dot is a
                real reply; the line is purely a visual link. */}
            {scoreSeries.map((s) => {
              const sorted = [...s.points].sort((a, b) =>
                a.ts.localeCompare(b.ts),
              );
              const coords = sorted.map((p) => ({
                x: xOf(p.ts),
                y: yScore(p.score),
              }));
              const d = coords
                .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
                .join(' ');
              return (
                <g key={`line-${s.key}`}>
                  {coords.length > 1 && (
                    <path
                      d={d}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {coords.map((c, i) => (
                    <circle
                      key={i}
                      cx={c.x}
                      cy={c.y}
                      r={3}
                      fill="var(--card)"
                      stroke={s.color}
                      strokeWidth={1.5}
                    >
                      <title>
                        {s.label} — {shortDate(new Date(sorted[i].ts))}: {sorted[i].score}/10
                      </title>
                    </circle>
                  ))}
                </g>
              );
            })}

            {/* Divider above the binary band */}
            {binarySeries.length > 0 && scoreSeries.length > 0 && (
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={PAD_T + SCORE_H + BAND_GAP / 2}
                y2={PAD_T + SCORE_H + BAND_GAP / 2}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
            )}

            {/* Binary count-marker band */}
            {binarySeries.map((s, idx) => {
              const rowY =
                PAD_T + SCORE_H + BAND_GAP + idx * BAND_ROW_H + BAND_ROW_H / 2;
              const yesPts = s.binaryPoints.filter((p) => p.score === 1);
              const noPts = s.binaryPoints.filter((p) => p.score === 0);
              return (
                <g key={`band-${s.key}`}>
                  <line
                    x1={PAD_L}
                    x2={W - PAD_R}
                    y1={rowY}
                    y2={rowY}
                    stroke="var(--border)"
                    strokeOpacity={0.5}
                    strokeWidth={0.5}
                  />
                  {/* No-reply tick marks (faint, hollow) so the coach
                      can see the cadence — yes is a filled bright dot,
                      no is a faint outline. */}
                  {noPts.map((p, i) => (
                    <circle
                      key={`n-${i}`}
                      cx={xOf(p.ts)}
                      cy={rowY}
                      r={2.5}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={0.35}
                      strokeWidth={1}
                    >
                      <title>{s.label} — {shortDate(new Date(p.ts))}: no</title>
                    </circle>
                  ))}
                  {yesPts.map((p, i) => (
                    <circle
                      key={`y-${i}`}
                      cx={xOf(p.ts)}
                      cy={rowY}
                      r={4}
                      fill={s.color}
                    >
                      <title>{s.label} — {shortDate(new Date(p.ts))}: yes</title>
                    </circle>
                  ))}
                </g>
              );
            })}

            {/* X-axis ticks */}
            {Array.from({ length: TICK_COUNT }, (_, i) => {
              const t = tMin + (tRange * i) / (TICK_COUNT - 1);
              const x = PAD_L + (innerW * i) / (TICK_COUNT - 1);
              return (
                <g key={`x-${i}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={H - PAD_B}
                    y2={H - PAD_B + 4}
                    stroke="var(--border)"
                    strokeWidth={0.5}
                  />
                  <text
                    x={x}
                    y={H - PAD_B + 14}
                    textAnchor={i === 0 ? 'start' : i === TICK_COUNT - 1 ? 'end' : 'middle'}
                    style={{ fontSize: 10, fill: 'var(--ink-mute)' }}
                    className="mono tabular"
                  >
                    {shortDate(new Date(t))}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Legend — clickable swatches that toggle each series. Lines
            get a horizontal bar, binary questions get a dot, so the
            visual matches what the chart shows. */}
        <div
          className="mt-4 flex flex-wrap gap-x-4 gap-y-2 pt-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          {series.map((s) => {
            const isHidden = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (isHidden) next.delete(s.key);
                    else next.add(s.key);
                    return next;
                  });
                }}
                className="flex items-center gap-2 text-[12px] text-[color:var(--ink-soft)] transition-opacity hover:opacity-80"
                style={{ opacity: isHidden ? 0.35 : 1 }}
                title={`${s.full}\n(${s.count} replies, ${s.isBinary ? 'yes/no' : '0–10 score'}) — click to ${isHidden ? 'show' : 'hide'}`}
              >
                {s.isBinary ? (
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 8, height: 8, background: s.color }}
                  />
                ) : (
                  <span
                    className="inline-block rounded-sm"
                    style={{ width: 16, height: 2.5, background: s.color }}
                  />
                )}
                <span className="line-clamp-1 max-w-[260px]">{s.label}</span>
                <span className="mono text-[10px] text-[color:var(--ink-mute)] tabular">
                  ({s.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
