'use client';

// Wellness-trends chart for an athlete. Reset & rebuilt from scratch
// after iterating on the per-question + bar + smoothed approaches.
//
// What's in vs out, and why:
//   - Lib-side filter only includes questions whose text explicitly
//     declares a 0/1–10 scale ('Reply 1-10') or a binary scale
//     ('0=no, 1=yes'). Free-text questions ('one thing to work on
//     next session?') are dropped — athletes answer those with rep
//     counts, severity numbers, etc., and plotting those alongside
//     wellness scores is misleading.
//   - Lib-side aggregates raw replies into one point per day per
//     metric (mean for scores, any-yes for binary). One point per
//     day matches Whoop / Oura / Smartabase conventions.
//
// What this component renders:
//   - Score (0-10) questions: straight-line series with a faint area
//     fill. Direct end-of-line labels — no busy legend taking up a
//     fifth of the card.
//   - Binary questions: a count band BELOW the line area, one row
//     per question. Filled dot = yes, hollow tick = no.
//   - Single shared date axis at the bottom.
//
// Visual rules followed (Cleveland, Tufte, Few):
//   - Soft palette over rainbow (data-ink ratio).
//   - No bezier smoothing (don't invent values between samples).
//   - Cap visible series at 4 to avoid line tangle.
//   - Direct end labels > legend hunting.

import { useMemo, useState } from 'react';
import type { QuestionTrend, TrendPoint } from '@/lib/survey-trends';

interface Props {
  trends: QuestionTrend[];
  initialVisibleScores?: number;
}

// Curated palette: distinct hues, all readable on cream. Avoids pure
// red so the value-tone red elsewhere in the app stays meaningful.
const SCORE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6'];
const BINARY_COLORS = ['#ef4444', '#f97316', '#a855f7', '#0ea5e9'];

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Strip 'Reply: …', '(…)' and similar scaffolding so the legend label
// is the question, not the protocol. Keep it punchy.
function shortLabel(q: string, max = 32): string {
  let s = q.replace(/\bReply\b[\s\S]*$/i, '').trim();
  s = s.replace(/\(.*\)\s*$/, '').trim();
  const firstQ = s.indexOf('?');
  if (firstQ !== -1 && firstQ < max + 8) s = s.slice(0, firstQ + 1);
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
  binaryPoints: TrendPoint[];
  count: number;
  last: TrendPoint | null;
  avg: number | null;
}

export function SurveyTrendsCard({ trends, initialVisibleScores = 4 }: Props) {
  const series = useMemo<Prepared[]>(() => {
    const sorted = [...trends].sort((a, b) => b.points.length - a.points.length);
    let scoreIdx = 0;
    let binaryIdx = 0;
    return sorted.map((t) => {
      const isBinary = t.kind === 'binary';
      const color = isBinary
        ? BINARY_COLORS[binaryIdx++ % BINARY_COLORS.length]
        : SCORE_COLORS[scoreIdx++ % SCORE_COLORS.length];
      const binaryPoints = isBinary
        ? t.points.map((p) => ({ ts: p.ts, score: p.score >= 0.5 ? 1 : 0 }))
        : t.points;
      const last = t.points.length ? t.points[t.points.length - 1] : null;
      const avg = t.points.length
        ? t.points.reduce((a, b) => a + b.score, 0) / t.points.length
        : null;
      return {
        key: t.key,
        label: shortLabel(t.question),
        full: t.question,
        color,
        isBinary,
        points: t.points,
        binaryPoints,
        count: t.points.length,
        last,
        avg,
      };
    });
  }, [trends]);

  const scoreAll = series.filter((s) => !s.isBinary);
  const binaryAll = series.filter((s) => s.isBinary);

  const [hidden, setHidden] = useState<Set<string>>(() => {
    // Default: top N score series + all binary series visible.
    const s = new Set<string>();
    scoreAll.slice(initialVisibleScores).forEach((x) => s.add(x.key));
    return s;
  });

  const visibleScore = scoreAll.filter((s) => !hidden.has(s.key));
  const visibleBinary = binaryAll.filter((s) => !hidden.has(s.key));

  // Time domain across visible data.
  const allTs: number[] = [];
  for (const s of [...visibleScore, ...visibleBinary])
    for (const p of s.points) allTs.push(new Date(p.ts).getTime());
  const tMin = allTs.length ? Math.min(...allTs) : 0;
  const tMax = allTs.length ? Math.max(...allTs) : 1;
  // Tiny right-side padding so end-of-line labels have room to breathe.
  const tRange = Math.max(tMax - tMin, 1);
  const tMaxPadded = tMax + tRange * 0.02;
  const fittedRange = Math.max(tMaxPadded - tMin, 1);

  // Layout — in viewBox space; SVG scales responsively.
  const W = 760;
  const PAD_L = 32;
  const PAD_R = 110; // wide right pad for end-of-line direct labels
  const PAD_T = 14;
  const PAD_B = 26;
  const SCORE_H = 200;
  const BAND_ROW_H = 22;
  const BAND_GAP = visibleBinary.length ? 18 : 0;
  const BAND_H = visibleBinary.length ? visibleBinary.length * BAND_ROW_H : 0;
  const H = PAD_T + SCORE_H + BAND_GAP + BAND_H + PAD_B;

  const innerW = W - PAD_L - PAD_R;
  const xOf = (ts: string) =>
    PAD_L + ((new Date(ts).getTime() - tMin) / fittedRange) * innerW;
  const yScore = (v: number) => PAD_T + ((10 - v) / 10) * SCORE_H;

  // X-axis ticks — pick a sensible step so labels don't crowd. Prefer
  // 5 ticks across any window from a week to a few months.
  const TICK_COUNT = 5;

  if (series.length === 0) {
    return (
      <Card>
        <Header title="Score trends" right="0 questions" />
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--ink-mute)]">
            — no scoreable replies in this window —
          </p>
          <p className="mt-1 text-[11.5px] text-[color:var(--ink-mute)]">
            Plots replies to questions that declare a 0–10 scale or a yes/no
            response.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Header
        title="Score trends"
        right={`${scoreAll.length} score · ${binaryAll.length} yes/no`}
      />

      <div className="px-4 md:px-6 py-5">
        {visibleScore.length === 0 && visibleBinary.length === 0 ? (
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
                  x2={W - PAD_R + 4}
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

            {/* Score series — soft area fill + straight line + dots */}
            {visibleScore.map((s) => {
              const sorted = [...s.points].sort((a, b) =>
                a.ts.localeCompare(b.ts),
              );
              if (sorted.length === 0) return null;
              const coords = sorted.map((p) => ({
                x: xOf(p.ts),
                y: yScore(p.score),
              }));
              const firstX = coords[0].x;
              const lastX = coords[coords.length - 1].x;
              const lastY = coords[coords.length - 1].y;
              const linePath = coords
                .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
                .join(' ');
              const areaPath =
                coords.length > 1
                  ? `${linePath} L ${lastX} ${PAD_T + SCORE_H} L ${firstX} ${PAD_T + SCORE_H} Z`
                  : '';
              return (
                <g key={`line-${s.key}`}>
                  {areaPath && (
                    <path d={areaPath} fill={s.color} fillOpacity={0.06} />
                  )}
                  <path
                    d={linePath}
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
                        {s.label} — {shortDate(new Date(sorted[i].ts))}: {sorted[i].score.toFixed(1)}/10
                      </title>
                    </circle>
                  ))}
                  {/* Direct end-of-line label — replaces a busy
                      legend with the right answer in the right place */}
                  <text
                    x={lastX + 8}
                    y={lastY + 3}
                    style={{
                      fontSize: 11,
                      fill: s.color,
                      fontWeight: 600,
                    }}
                    className="mono tabular"
                  >
                    {sorted[sorted.length - 1].score.toFixed(1)}
                  </text>
                  <text
                    x={lastX + 8}
                    y={lastY + 15}
                    style={{
                      fontSize: 9.5,
                      fill: 'var(--ink-mute)',
                    }}
                    className="line-clamp-1"
                  >
                    {s.label}
                  </text>
                </g>
              );
            })}

            {/* Divider above the binary band */}
            {visibleBinary.length > 0 && visibleScore.length > 0 && (
              <line
                x1={PAD_L}
                x2={W - PAD_R + 4}
                y1={PAD_T + SCORE_H + BAND_GAP / 2}
                y2={PAD_T + SCORE_H + BAND_GAP / 2}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
            )}

            {/* Binary count-marker band */}
            {visibleBinary.map((s, idx) => {
              const rowY =
                PAD_T +
                SCORE_H +
                BAND_GAP +
                idx * BAND_ROW_H +
                BAND_ROW_H / 2;
              const yesPts = s.binaryPoints.filter((p) => p.score === 1);
              const noPts = s.binaryPoints.filter((p) => p.score === 0);
              const yesCount = yesPts.length;
              const total = s.binaryPoints.length;
              return (
                <g key={`band-${s.key}`}>
                  <line
                    x1={PAD_L}
                    x2={W - PAD_R + 4}
                    y1={rowY}
                    y2={rowY}
                    stroke="var(--border)"
                    strokeOpacity={0.5}
                    strokeWidth={0.5}
                  />
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
                      <title>
                        {s.label} — {shortDate(new Date(p.ts))}: no
                      </title>
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
                      <title>
                        {s.label} — {shortDate(new Date(p.ts))}: yes
                      </title>
                    </circle>
                  ))}
                  {/* Right-side label: 'yes 8/26' */}
                  <text
                    x={W - PAD_R + 8}
                    y={rowY + 3}
                    style={{
                      fontSize: 10.5,
                      fill: s.color,
                      fontWeight: 600,
                    }}
                    className="mono tabular"
                  >
                    {yesCount}/{total}
                  </text>
                  <text
                    x={W - PAD_R + 8}
                    y={rowY + 14}
                    style={{
                      fontSize: 9,
                      fill: 'var(--ink-mute)',
                    }}
                    className="line-clamp-1"
                  >
                    {s.label}
                  </text>
                </g>
              );
            })}

            {/* X-axis date ticks */}
            {Array.from({ length: TICK_COUNT }, (_, i) => {
              const t = tMin + (fittedRange * i) / (TICK_COUNT - 1);
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

        {/* Compact toggle row — minimal, just lets the user pick which
            of the (already filtered + ranked) series they want to see */}
        {series.length > 0 && (
          <div
            className="mt-4 flex flex-wrap gap-x-3 gap-y-2 pt-3 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            {series.map((s) => {
              const isHidden = hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (isHidden) next.delete(s.key);
                      else next.add(s.key);
                      return next;
                    })
                  }
                  className="flex items-center gap-1.5 text-[11.5px] text-[color:var(--ink-soft)] transition-opacity hover:opacity-80"
                  style={{ opacity: isHidden ? 0.35 : 1 }}
                  title={`${s.full}\n${s.count} replies, ${s.isBinary ? 'yes/no' : '0–10 score'}`}
                >
                  {s.isBinary ? (
                    <span
                      className="inline-block rounded-full"
                      style={{ width: 7, height: 7, background: s.color }}
                    />
                  ) : (
                    <span
                      className="inline-block rounded-sm"
                      style={{ width: 12, height: 2.5, background: s.color }}
                    />
                  )}
                  <span className="line-clamp-1 max-w-[200px]">{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </section>
  );
}

function Header({ title, right }: { title: string; right: string }) {
  return (
    <header
      className="flex items-center justify-between gap-3 px-6 py-4 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="text-base font-bold text-[color:var(--ink)]">{title}</h2>
      <span className="text-[11.5px] text-[color:var(--ink-mute)] tabular">
        {right}
      </span>
    </header>
  );
}
