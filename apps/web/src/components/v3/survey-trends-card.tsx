'use client';

// Single unified score-trends chart for an athlete. Inspired by the
// original reflect Chart.js view (templates/player/trends.html), but
// rebuilt as pure SVG so we don't pull in a chart library:
//   - 0..10 score questions render as smooth lines on the main y-axis
//     (one color per question, dots at each reply).
//   - Binary yes/no questions render BELOW the score chart as a count-
//     marker band — one row per question, a colored dot on every date
//     the athlete replied "yes". Putting them on the same time axis
//     lets the coach correlate "pain → readiness drop" at a glance,
//     which a forest of separate cards never could.
//   - Legend at the bottom is clickable: tap a series to hide/show it.
//
// Question shape detection: a series is treated as binary when ≤10%
// of its replies exceed 1. Tolerates the occasional outlier (athlete
// types '6' to a yes/no q) without scaling the y-axis to that ceiling.

import { useMemo, useState } from 'react';
import type { QuestionTrend, TrendPoint } from '@/lib/survey-trends';

interface Props {
  trends: QuestionTrend[];
}

// Distinct hues that read well on the cream/light theme. Avoid pure
// red so reds in the chart still stand out as "score in danger zone"
// when used as data tone elsewhere.
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

function isBinaryTrend(points: TrendPoint[]): boolean {
  if (points.length === 0) return false;
  const exceedsOne = points.filter((p) => p.score > 1).length;
  return exceedsOne / points.length <= 0.1;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Strip protocol scaffolding from a question so the legend label fits.
// Example: 'Did any pain or physical issue start or get worse during
// practice today? Reply: 0 = no, 1 = yes' → 'Did any pain start?'
function shortQuestionLabel(q: string, max = 36): string {
  let s = q.replace(/\bReply\b.*$/i, '').trim();
  s = s.replace(/\(.*\)\s*$/, '').trim();
  // First sentence (up to '?') is usually the meat.
  const firstQ = s.indexOf('?');
  if (firstQ !== -1) s = s.slice(0, firstQ + 1);
  if (s.length > max) s = s.slice(0, max - 1).trim() + '…';
  return s;
}

interface PreparedSeries {
  key: string;
  label: string;
  full: string;
  color: string;
  isBinary: boolean;
  points: TrendPoint[];
}

// Cubic-bezier path with horizontal control handles — gives a soft
// curve through the points without overshoot, matching Chart.js's
// 'tension: 0.3' look without pulling in a math lib.
function smoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) {
    const p = coords[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y}`;
  }
  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const cur = coords[i];
    const next = coords[i + 1];
    const dx = (next.x - cur.x) * 0.5;
    d += ` C ${cur.x + dx} ${cur.y} ${next.x - dx} ${next.y} ${next.x} ${next.y}`;
  }
  return d;
}

export function SurveyTrendsCard({ trends }: Props) {
  const series = useMemo<PreparedSeries[]>(
    () =>
      trends.map((t, i) => ({
        key: t.key,
        label: shortQuestionLabel(t.question),
        full: t.question,
        color: PALETTE[i % PALETTE.length],
        isBinary: isBinaryTrend(t.points),
        points: t.points,
      })),
    [trends],
  );

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = series.filter((s) => !hidden.has(s.key));

  // Domain — span all points across all visible series so changing
  // legend selection re-fits the chart sensibly.
  const allTs: number[] = [];
  for (const s of visible) for (const p of s.points) allTs.push(new Date(p.ts).getTime());
  const tMin = allTs.length ? Math.min(...allTs) : 0;
  const tMax = allTs.length ? Math.max(...allTs) : 1;
  const tRange = Math.max(tMax - tMin, 1);

  const scoreSeries = visible.filter((s) => !s.isBinary);
  const binarySeries = visible.filter((s) => s.isBinary);

  // Layout — viewBox space; the SVG is responsive via width=100%.
  const W = 760;
  const PAD_L = 28;
  const PAD_R = 16;
  const PAD_T = 14;
  const PAD_B = 24; // x-axis tick labels
  const SCORE_H = 200;
  const BAND_ROW_H = 16;
  const BAND_GAP = binarySeries.length ? 14 : 0;
  const BAND_H = binarySeries.length ? binarySeries.length * BAND_ROW_H : 0;
  const H = PAD_T + SCORE_H + BAND_GAP + BAND_H + PAD_B;

  const innerW = W - PAD_L - PAD_R;
  const xOf = (ts: string) =>
    PAD_L + ((new Date(ts).getTime() - tMin) / tRange) * innerW;
  const yScore = (v: number) => PAD_T + ((10 - v) / 10) * SCORE_H;

  // Date ticks — 6 evenly spaced labels along the time axis. Looks
  // clean across any window from 7d to ~1y without manual tuning.
  const TICK_COUNT = 6;
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const t = tMin + (tRange * i) / (TICK_COUNT - 1);
    return { t, label: shortDate(new Date(t)) };
  });

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
          {trends.length} {trends.length === 1 ? 'question' : 'questions'}
          {hidden.size > 0 ? ` · ${hidden.size} hidden` : ''}
        </span>
      </header>

      <div className="px-4 md:px-6 py-5">
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

          {/* Score lines — smooth path + dots */}
          {scoreSeries.map((s) => {
            const sorted = [...s.points].sort((a, b) =>
              a.ts.localeCompare(b.ts),
            );
            const coords = sorted.map((p) => ({
              x: xOf(p.ts),
              y: yScore(p.score),
            }));
            return (
              <g key={`line-${s.key}`}>
                <path
                  d={smoothPath(coords)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {coords.map((c, i) => (
                  <circle
                    key={i}
                    cx={c.x}
                    cy={c.y}
                    r={2.75}
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
          {binarySeries.length > 0 && (
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
            const rowY = PAD_T + SCORE_H + BAND_GAP + idx * BAND_ROW_H + BAND_ROW_H / 2;
            const yesPts = s.points.filter((p) => p.score >= 0.5);
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
                <text
                  x={PAD_L - 6}
                  y={rowY + 3}
                  textAnchor="end"
                  style={{ fontSize: 9, fill: 'var(--ink-mute)' }}
                  className="mono tabular"
                >
                  ●
                </text>
                {yesPts.map((p, i) => (
                  <circle
                    key={i}
                    cx={xOf(p.ts)}
                    cy={rowY}
                    r={3.5}
                    fill={s.color}
                  >
                    <title>
                      {s.label} — {shortDate(new Date(p.ts))}: yes
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}

          {/* X-axis ticks */}
          {ticks.map((t, i) => {
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
                  {t.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend — clickable swatches that toggle each series. Lines
            get a horizontal bar, binary questions get a dot, so the
            visual matches what the chart shows. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
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
                title={`${s.full}\n(${s.points.length} replies, ${s.isBinary ? 'yes/no' : '0-10 score'}) — click to ${isHidden ? 'show' : 'hide'}`}
              >
                {s.isBinary ? (
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 7, height: 7, background: s.color }}
                  />
                ) : (
                  <span
                    className="inline-block rounded-sm"
                    style={{ width: 14, height: 2.5, background: s.color }}
                  />
                )}
                <span className="line-clamp-1 max-w-[220px]">{s.label}</span>
                <span className="mono text-[10px] text-[color:var(--ink-mute)] tabular">
                  ({s.points.length})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
