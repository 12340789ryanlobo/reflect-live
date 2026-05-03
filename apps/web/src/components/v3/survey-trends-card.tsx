'use client';

// Calendar-heatmap visualization of an athlete's survey replies.
//
// Each row is one question; each column is one calendar day in the
// active window. Cells are colored by reply value:
//   - score (0-10):  red 1-4 / amber 5-6 / green 7-10
//   - binary (0/1):  filled red = yes, hollow ring = no
//   - no reply:      faint background dot (so cadence + compliance
//                    gaps stay visible — distinct from "they replied no")
//
// Why a heatmap and not the line chart we kept iterating on:
// 5 metrics with sparse irregular sampling kept producing overlapping
// lines, lone-outlier axis-stretching, and label collisions. The
// heatmap collapses all of that — every reply is one fixed-width
// cell, dates align trivially across rows, gaps become visible, and
// vertical scanning at any column shows cross-metric correlation
// ('did pain spike the same week readiness dropped?').
//
// See docs/superpowers/specs/2026-05-02-score-trends-heatmap-design.md
// for the full design rationale.

import type { Period } from '@/lib/period';
import type { QuestionTrend, TrendPoint } from '@/lib/survey-trends';

interface Props {
  trends: QuestionTrend[];
  /** Page-level period toggle. Drives the heatmap's horizontal extent. */
  period: Period;
}

const RED = '#ef4444';
const AMBER = '#f59e0b';
const GREEN = '#10b981';
const MUTE = 'var(--ink-mute)';

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function shortLabel(q: string, max = 36): string {
  let s = q.replace(/\bReply\b[\s\S]*$/i, '').trim();
  s = s.replace(/\(.*\)\s*$/, '').trim();
  const firstQ = s.indexOf('?');
  if (firstQ !== -1 && firstQ < max + 8) s = s.slice(0, firstQ + 1);
  if (s.length > max) s = s.slice(0, max - 1).trim() + '…';
  return s;
}

// Discrete tones at 4 buckets read better than a gradient at small
// cell sizes. Matches the rest of the app's value-tone language.
function scoreTone(v: number): string {
  if (v < 1) return MUTE;
  const f = Math.floor(v);
  if (f <= 4) return RED;
  if (f <= 6) return AMBER;
  return GREEN;
}

function dayKey(ts: string): string {
  return ts.slice(0, 10); // YYYY-MM-DD
}

// Build the inclusive list of calendar-day timestamps that the
// heatmap grid spans, given an [from, to] window in ms.
function daysBetween(fromMs: number, toMs: number): string[] {
  const out: string[] = [];
  const start = new Date(fromMs);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(toMs);
  end.setUTCHours(0, 0, 0, 0);
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

interface Prepared {
  key: string;
  label: string;
  full: string;
  isBinary: boolean;
  count: number;
  last: TrendPoint | null;
  avg: number | null;
  yesCount: number;
  // Reply value keyed by YYYY-MM-DD for fast cell lookup.
  byDay: Map<string, number>;
}

function prepare(trends: QuestionTrend[]): Prepared[] {
  return trends
    .map((t) => {
      const isBinary = t.kind === 'binary';
      const byDay = new Map<string, number>();
      for (const p of t.points) {
        const k = dayKey(p.ts);
        const cur = byDay.get(k);
        if (cur == null) byDay.set(k, p.score);
        else byDay.set(k, isBinary ? Math.max(cur, p.score) : (cur + p.score) / 2);
      }
      const last = t.points.length ? t.points[t.points.length - 1] : null;
      const avg = t.points.length
        ? t.points.reduce((a, b) => a + b.score, 0) / t.points.length
        : null;
      const yesCount = isBinary
        ? t.points.filter((p) => p.score >= 0.5).length
        : 0;
      return {
        key: t.key,
        label: shortLabel(t.question),
        full: t.question,
        isBinary,
        count: t.points.length,
        last,
        avg,
        yesCount,
        byDay,
      };
    })
    .sort((a, b) => {
      // Score rows first, then binary; within each, descending by count.
      if (a.isBinary !== b.isBinary) return a.isBinary ? 1 : -1;
      return b.count - a.count;
    });
}

// Compute the heatmap's horizontal time window. Driven by the page's
// period toggle, but with a hard ceiling at 90 days when period=all
// so cells stay readable on a 760px viewBox.
function windowFor(period: Period, trends: Prepared[]): { from: number; to: number } {
  const now = Date.now();
  if (period !== 'all') {
    return { from: now - period * 86400_000, to: now };
  }
  const allTs: number[] = [];
  for (const t of trends) for (const k of t.byDay.keys()) allTs.push(new Date(`${k}T12:00:00Z`).getTime());
  if (allTs.length === 0) return { from: now - 30 * 86400_000, to: now };
  const dataMin = Math.min(...allTs);
  const dataMax = Math.max(...allTs);
  const span = dataMax - dataMin;
  const cap = 90 * 86400_000;
  if (span <= cap) return { from: dataMin, to: dataMax };
  return { from: dataMax - cap, to: dataMax };
}

const W = 760;
const STATS_W = 220;
const ROW_GAP = 6;
const ROW_H = 22;
const GROUP_GAP = 14;
const PAD_X = 16;
const AXIS_H = 22;

export function SurveyTrendsCard({ trends, period }: Props) {
  const series = prepare(trends);

  if (series.length === 0) {
    return (
      <Card>
        <Header title="Score trends" right="0 questions" />
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--ink-mute)]">
            — no scoreable replies in this window —
          </p>
        </div>
      </Card>
    );
  }

  const { from, to } = windowFor(period, series);
  const days = daysBetween(from, to);
  const cellW = (W - STATS_W - PAD_X * 2) / days.length;
  const cellPad = days.length > 70 ? 0.5 : days.length > 30 ? 1 : 1.5;
  const cellSize = Math.max(cellW - cellPad * 2, 2);

  const scoreSeries = series.filter((s) => !s.isBinary);
  const binarySeries = series.filter((s) => s.isBinary);

  // Vertical layout
  const scoreH = scoreSeries.length * (ROW_H + ROW_GAP);
  const binaryH = binarySeries.length * (ROW_H + ROW_GAP);
  const groupGap = scoreSeries.length > 0 && binarySeries.length > 0 ? GROUP_GAP : 0;
  const H = scoreH + groupGap + binaryH + AXIS_H + 8;

  const gridLeft = STATS_W + PAD_X;
  const xOfDay = (i: number) => gridLeft + i * cellW + cellPad;

  // Date-axis labels: 5 evenly spaced
  const TICK_COUNT = 5;
  const tickAt = (i: number) =>
    days[Math.round(((days.length - 1) * i) / (TICK_COUNT - 1))];

  const totalReplies = series.reduce((s, x) => s + x.count, 0);
  const repliesInWindow = series.reduce((sum, s) => {
    let c = 0;
    for (const k of s.byDay.keys()) {
      const t = new Date(`${k}T12:00:00Z`).getTime();
      if (t >= from && t <= to) c++;
    }
    return sum + c;
  }, 0);

  return (
    <Card>
      <Header
        title="Score trends"
        right={`${scoreSeries.length} score · ${binarySeries.length} yes/no`}
      />

      {repliesInWindow === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--ink-mute)]">
            — no replies in this window —
          </p>
          <p className="mt-1 text-[11.5px] text-[color:var(--ink-mute)]">
            {totalReplies} reply{totalReplies === 1 ? '' : 's'} on file. Try a longer period.
          </p>
        </div>
      ) : (
        <div className="px-4 md:px-6 py-5 overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            style={{ minWidth: 600 }}
          >
            {/* Score rows */}
            {scoreSeries.map((s, rowIdx) => {
              const yTop = rowIdx * (ROW_H + ROW_GAP);
              const cy = yTop + ROW_H / 2;
              return (
                <HeatRow
                  key={s.key}
                  series={s}
                  yTop={yTop}
                  cy={cy}
                  days={days}
                  xOfDay={xOfDay}
                  cellSize={cellSize}
                  cellW={cellW}
                  statsX={PAD_X}
                  statsW={STATS_W}
                  isBinary={false}
                />
              );
            })}

            {/* Group separator */}
            {scoreSeries.length > 0 && binarySeries.length > 0 && (
              <line
                x1={PAD_X}
                x2={W - PAD_X}
                y1={scoreH + GROUP_GAP / 2}
                y2={scoreH + GROUP_GAP / 2}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
            )}

            {/* Binary rows */}
            {binarySeries.map((s, rowIdx) => {
              const yTop = scoreH + groupGap + rowIdx * (ROW_H + ROW_GAP);
              const cy = yTop + ROW_H / 2;
              return (
                <HeatRow
                  key={s.key}
                  series={s}
                  yTop={yTop}
                  cy={cy}
                  days={days}
                  xOfDay={xOfDay}
                  cellSize={cellSize}
                  cellW={cellW}
                  statsX={PAD_X}
                  statsW={STATS_W}
                  isBinary
                />
              );
            })}

            {/* Date axis */}
            {Array.from({ length: TICK_COUNT }, (_, i) => {
              const dayIdx = Math.round(((days.length - 1) * i) / (TICK_COUNT - 1));
              const x = xOfDay(dayIdx) + cellSize / 2;
              const ay = scoreH + groupGap + binaryH + 14;
              return (
                <g key={`tick-${i}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={ay - 8}
                    y2={ay - 4}
                    stroke="var(--border)"
                    strokeWidth={0.5}
                  />
                  <text
                    x={x}
                    y={ay + 6}
                    textAnchor={i === 0 ? 'start' : i === TICK_COUNT - 1 ? 'end' : 'middle'}
                    style={{ fontSize: 10, fill: 'var(--ink-mute)' }}
                    className="mono tabular"
                  >
                    {shortDate(new Date(`${tickAt(i)}T12:00:00Z`))}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </Card>
  );
}

interface HeatRowProps {
  series: Prepared;
  yTop: number;
  cy: number;
  days: string[];
  xOfDay: (i: number) => number;
  cellSize: number;
  cellW: number;
  statsX: number;
  statsW: number;
  isBinary: boolean;
}

function HeatRow({
  series,
  yTop,
  cy,
  days,
  xOfDay,
  cellSize,
  cellW,
  statsX,
  statsW,
  isBinary,
}: HeatRowProps) {
  const lastTone = series.last
    ? isBinary
      ? series.last.score >= 0.5
        ? RED
        : MUTE
      : scoreTone(series.last.score)
    : MUTE;

  const lastLabel = series.last
    ? isBinary
      ? series.last.score >= 0.5
        ? 'last yes'
        : 'last no'
      : `last ${series.last.score.toFixed(1)}`
    : '';

  const stat2 = isBinary
    ? `${series.yesCount}/${series.count} yes · ${Math.round((series.yesCount / Math.max(series.count, 1)) * 100)}%`
    : `avg ${series.avg != null ? series.avg.toFixed(1) : '–'} · ${series.count} replies`;

  return (
    <g>
      {/* Stats column */}
      <text
        x={statsX}
        y={yTop + 10}
        style={{
          fontSize: 12,
          fill: 'var(--ink)',
          fontWeight: 600,
        }}
        className="line-clamp-1"
      >
        <title>{series.full}</title>
        {series.label}
      </text>
      <text
        x={statsX}
        y={yTop + 22}
        style={{ fontSize: 10, fill: 'var(--ink-mute)' }}
        className="mono tabular"
      >
        {stat2}
      </text>
      <text
        x={statsX + statsW - 8}
        y={yTop + 14}
        textAnchor="end"
        style={{
          fontSize: 11,
          fontWeight: 600,
          fill: lastTone,
        }}
        className="mono tabular"
      >
        {lastLabel}
      </text>

      {/* Cells */}
      {days.map((d, i) => {
        const v = series.byDay.get(d);
        const cx = xOfDay(i);
        if (v == null) {
          // No reply: faint background dot
          return (
            <circle
              key={i}
              cx={cx + cellSize / 2}
              cy={cy}
              r={Math.max(cellSize / 5, 0.6)}
              fill="var(--border)"
              fillOpacity={0.4}
            />
          );
        }

        if (isBinary) {
          const isYes = v >= 0.5;
          if (isYes) {
            return (
              <circle
                key={i}
                cx={cx + cellSize / 2}
                cy={cy}
                r={Math.max(cellSize / 2 - 0.5, 2)}
                fill={RED}
              >
                <title>{shortDate(new Date(`${d}T12:00:00Z`))}: yes</title>
              </circle>
            );
          }
          return (
            <circle
              key={i}
              cx={cx + cellSize / 2}
              cy={cy}
              r={Math.max(cellSize / 2 - 1, 1.5)}
              fill="none"
              stroke={MUTE}
              strokeWidth={1}
            >
              <title>{shortDate(new Date(`${d}T12:00:00Z`))}: no</title>
            </circle>
          );
        }

        // Score cell — a rounded square.
        const tone = scoreTone(v);
        return (
          <rect
            key={i}
            x={cx}
            y={cy - cellSize / 2}
            width={cellSize}
            height={cellSize}
            rx={Math.min(2, cellSize / 4)}
            fill={tone}
            fillOpacity={0.85}
          >
            <title>
              {shortDate(new Date(`${d}T12:00:00Z`))}: {v.toFixed(1)}/10
            </title>
          </rect>
        );
      })}
    </g>
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
