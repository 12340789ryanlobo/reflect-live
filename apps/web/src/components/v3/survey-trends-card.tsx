'use client';

// Calendar-heatmap visualization of an athlete's survey replies.
//
// Each row is one question; each column is one calendar day in the
// active page-period window. Cells:
//   - score (0-10):  continuous red→amber→green gradient by value
//   - binary (0/1):  filled red dot = yes, hollow ring = no
//   - no reply:      faint background tick
//
// Why a heatmap (after four chart iterations failed):
//   - Every reply is one fixed-width cell — lone outliers can't
//     stretch the chart anymore.
//   - Dates align trivially across rows; cross-metric correlation
//     is a vertical scan ('did pain spike when readiness dropped?').
//   - 'No reply' is a real, visible thing (faint tick) — distinct
//     from 'they replied no'.
//   - Universal mental model (GitHub contribution graph).
//
// Layout splits each row into HTML stats (left) + SVG heatmap (right),
// so question titles get proper CSS truncation/wrap instead of SVG
// text overflow. Single shared SVG for the heatmap so columns align
// exactly across rows.
//
// See docs/superpowers/specs/2026-05-02-score-trends-heatmap-design.md

import type { Period } from '@/lib/period';
import type { QuestionTrend, TrendPoint } from '@/lib/survey-trends';

interface Props {
  trends: QuestionTrend[];
  /** Page period toggle. Drives the heatmap's horizontal extent. */
  period: Period;
}

// Continuous red→amber→green gradient over 1..10. The two-leg HSL
// interpolation (red→amber on the bottom half, amber→green on the
// top half) keeps the midline anchored at amber/5 so coaches read
// "around 5 = warning" the same way they do everywhere else in the
// app, while the rest of the scale flows smoothly.
function scoreTone(v: number): string {
  if (v < 1) return 'var(--ink-mute)';
  const c = Math.min(10, v);
  // hsl: 0=red, 38=amber, 145=green. Saturation/lightness chosen
  // to match the discrete app palette so the gradient mid-points
  // ride right through the existing red/amber/green tokens.
  let hue: number;
  if (c <= 5) hue = ((c - 1) / 4) * 38;          // 1..5 → 0..38
  else hue = 38 + ((c - 5) / 5) * (145 - 38);    // 5..10 → 38..145
  return `hsl(${hue.toFixed(0)}, 78%, 48%)`;
}

const RED = '#ef4444';
const MUTE = 'var(--ink-mute)';

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dayKey(ts: string): string {
  return ts.slice(0, 10); // YYYY-MM-DD
}

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
  full: string;
  isBinary: boolean;
  // Raw counts — reflect EVERY reply, not just unique days. Drives the
  // stats display so coaches see the honest numbers.
  rawCount: number;
  rawAvg: number;
  rawYesCount: number;
  // Day-aggregated values for cell rendering.
  byDay: Map<string, number>;
  // Last raw reply (for the 'last X' summary).
  lastReply: TrendPoint | null;
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
      return {
        key: t.key,
        full: t.question,
        isBinary,
        rawCount: t.rawCount,
        rawAvg: t.rawAvg,
        rawYesCount: t.rawYesCount,
        byDay,
        lastReply: t.points.length ? t.points[t.points.length - 1] : null,
      };
    })
    .sort((a, b) => {
      if (a.isBinary !== b.isBinary) return a.isBinary ? 1 : -1;
      return b.rawCount - a.rawCount;
    });
}

function windowFor(
  period: Period,
  trends: Prepared[],
): { from: number; to: number } {
  const now = Date.now();
  if (period !== 'all') {
    return { from: now - period * 86400_000, to: now };
  }
  const allTs: number[] = [];
  for (const t of trends)
    for (const k of t.byDay.keys()) allTs.push(new Date(`${k}T12:00:00Z`).getTime());
  if (allTs.length === 0) return { from: now - 30 * 86400_000, to: now };
  const dataMin = Math.min(...allTs);
  const dataMax = Math.max(...allTs);
  const span = dataMax - dataMin;
  const cap = 90 * 86400_000;
  if (span <= cap) return { from: dataMin, to: dataMax };
  return { from: dataMax - cap, to: dataMax };
}

const ROW_H = 22;
const ROW_GAP = 6;
const GROUP_GAP = 14;
const AXIS_H = 22;
const PAD_TOP = 4;
const STATS_W_PX = 220;
const SVG_PAD_X = 6;

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

  const scoreSeries = series.filter((s) => !s.isBinary);
  const binarySeries = series.filter((s) => s.isBinary);
  const totalReplies = series.reduce((s, x) => s + x.rawCount, 0);
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

      <ScaleLegend />

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
        <>
          {scoreSeries.map((s, i) => (
            <Row
              key={s.key}
              series={s}
              days={days}
              isLast={i === scoreSeries.length - 1 && binarySeries.length === 0}
            />
          ))}
          {scoreSeries.length > 0 && binarySeries.length > 0 && (
            <div className="border-t" style={{ borderColor: 'var(--border)' }} />
          )}
          {binarySeries.map((s, i) => (
            <Row
              key={s.key}
              series={s}
              days={days}
              isLast={i === binarySeries.length - 1}
            />
          ))}
          <DateAxis days={days} />
        </>
      )}
    </Card>
  );
}

function Row({
  series,
  days,
  isLast,
}: {
  series: Prepared;
  days: string[];
  isLast: boolean;
}) {
  const last = series.lastReply;
  const lastTone = last
    ? series.isBinary
      ? last.score >= 0.5
        ? RED
        : MUTE
      : scoreTone(last.score)
    : MUTE;
  const lastLabel = last
    ? series.isBinary
      ? last.score >= 0.5
        ? 'yes'
        : 'no'
      : last.score.toFixed(1)
    : '–';

  const stat2 = series.isBinary
    ? `${series.rawYesCount}/${series.rawCount} yes · ${series.rawCount === 0 ? 0 : Math.round((series.rawYesCount / series.rawCount) * 100)}%`
    : `avg ${series.rawAvg.toFixed(1)} · ${series.rawCount} ${series.rawCount === 1 ? 'reply' : 'replies'}`;

  return (
    <div
      className={`flex items-stretch ${isLast ? '' : ''}`}
      style={{ height: ROW_H + ROW_GAP }}
    >
      {/* HTML stats column — proper CSS truncation, no SVG text math */}
      <div
        className="flex items-center gap-2 pl-6 pr-3 shrink-0"
        style={{ width: STATS_W_PX }}
      >
        <div className="min-w-0 flex-1">
          <div
            className="text-[12.5px] font-semibold text-[color:var(--ink)] truncate leading-tight"
            title={series.full}
          >
            {series.full}
          </div>
          <div className="mono text-[10px] text-[color:var(--ink-mute)] tabular leading-tight mt-0.5">
            {stat2}
          </div>
        </div>
        <div
          className="mono text-[11px] tabular font-semibold shrink-0 leading-tight"
          style={{ color: lastTone }}
          title={last ? `last reply on ${shortDate(new Date(last.ts))}` : ''}
        >
          {lastLabel}
        </div>
      </div>

      {/* SVG heatmap row — fills remaining space; cells sized by container */}
      <div className="flex-1 min-w-0 pr-6">
        <HeatmapRow series={series} days={days} height={ROW_H + ROW_GAP} />
      </div>
    </div>
  );
}

function HeatmapRow({
  series,
  days,
  height,
}: {
  series: Prepared;
  days: string[];
  height: number;
}) {
  // ViewBox width chosen so cells stay readable across realistic
  // window sizes. Each day is one column; preserveAspectRatio='none'
  // lets the SVG stretch horizontally to fill its container.
  const VB_W = Math.max(days.length * 12, 600);
  const cellW = (VB_W - SVG_PAD_X * 2) / days.length;
  const cellGap = days.length > 70 ? 0.5 : days.length > 30 ? 1 : 1.5;
  const cellSize = Math.max(cellW - cellGap * 2, 2);
  const cy = height / 2;
  const xOf = (i: number) => SVG_PAD_X + i * cellW + cellGap;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${height}`}
      className="block w-full"
      preserveAspectRatio="none"
      style={{ height }}
    >
      {days.map((d, i) => {
        const v = series.byDay.get(d);
        const cx = xOf(i) + cellSize / 2;
        if (v == null) {
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={Math.max(cellSize / 6, 0.6)}
              fill="var(--border)"
              fillOpacity={0.55}
            />
          );
        }
        if (series.isBinary) {
          const isYes = v >= 0.5;
          if (isYes) {
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={Math.max(cellSize / 2 - 0.5, 2)}
                fill={RED}
              >
                <title>
                  {shortDate(new Date(`${d}T12:00:00Z`))}: yes
                </title>
              </circle>
            );
          }
          return (
            <circle
              key={i}
              cx={cx}
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
        return (
          <rect
            key={i}
            x={xOf(i)}
            y={cy - cellSize / 2}
            width={cellSize}
            height={cellSize}
            rx={Math.min(2, cellSize / 4)}
            fill={scoreTone(v)}
            fillOpacity={0.92}
          >
            <title>
              {shortDate(new Date(`${d}T12:00:00Z`))}: {v.toFixed(1)}/10
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

function DateAxis({ days }: { days: string[] }) {
  const TICK_COUNT = 5;
  return (
    <div className="flex items-stretch" style={{ height: AXIS_H }}>
      <div className="shrink-0" style={{ width: STATS_W_PX }} />
      <div className="flex-1 min-w-0 pr-6 relative">
        <svg
          viewBox={`0 0 ${Math.max(days.length * 12, 600)} ${AXIS_H}`}
          className="block w-full"
          preserveAspectRatio="none"
          style={{ height: AXIS_H }}
        >
          {Array.from({ length: TICK_COUNT }, (_, i) => {
            const dayIdx = Math.round(((days.length - 1) * i) / (TICK_COUNT - 1));
            const VB_W = Math.max(days.length * 12, 600);
            const cellW = (VB_W - SVG_PAD_X * 2) / days.length;
            const x = SVG_PAD_X + dayIdx * cellW + cellW / 2;
            return (
              <g key={i}>
                <line
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={4}
                  stroke="var(--border)"
                  strokeWidth={0.5}
                />
                <text
                  x={x}
                  y={16}
                  textAnchor={i === 0 ? 'start' : i === TICK_COUNT - 1 ? 'end' : 'middle'}
                  style={{ fontSize: 10, fill: 'var(--ink-mute)' }}
                  className="mono tabular"
                >
                  {shortDate(new Date(`${days[dayIdx]}T12:00:00Z`))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Color legend so the user immediately knows what cell tones mean.
// Two halves: a smooth gradient bar (1..10 score) on the left, and a
// pair of binary swatches on the right. Without this, a coach has to
// hover cells one at a time to figure out the visual language.
function ScaleLegend() {
  return (
    <div
      className="flex items-center justify-between gap-6 px-6 py-3 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
          Score
        </span>
        <div
          className="rounded-full"
          style={{
            width: 160,
            height: 8,
            background:
              'linear-gradient(90deg,' +
              [1, 2.5, 4, 5, 6, 7.5, 9, 10]
                .map((v) => scoreTone(v))
                .join(',') +
              ')',
          }}
        />
        <span className="mono text-[10px] tabular text-[color:var(--ink-mute)]">
          1
        </span>
        <span className="mono text-[10px] tabular text-[color:var(--ink-mute)]">
          10
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
          Yes/no
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block rounded-full"
            style={{ width: 9, height: 9, background: RED }}
          />
          <span className="text-[11px] text-[color:var(--ink-soft)]">yes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block rounded-full border"
            style={{ width: 9, height: 9, borderColor: 'var(--ink-mute)' }}
          />
          <span className="text-[11px] text-[color:var(--ink-soft)]">no</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block rounded-full"
            style={{
              width: 4,
              height: 4,
              background: 'var(--border)',
              opacity: 0.55,
              margin: '0 2.5px',
            }}
          />
          <span className="text-[11px] text-[color:var(--ink-soft)]">no reply</span>
        </div>
      </div>
    </div>
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
