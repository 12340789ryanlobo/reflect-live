'use client';

// Wellness-trends panel for an athlete. Built as "small multiples"
// (Tufte): each question gets its OWN row with its own mini chart,
// and they all share a single date axis at the bottom. Why:
//
//   - 5+ overlapping lines on one canvas was unreadable. Cleveland's
//     research caps useful multi-line charts around 4 series; beyond
//     that, viewers can't track individual lines.
//   - Sparse, irregular sampling across metrics means lone outliers
//     (e.g. one reply 3 weeks after the rest) stretched the whole
//     chart and produced misleading "trend" lines connecting distant
//     samples.
//   - Direct end-of-line labels collided when multiple metrics ended
//     near the same x.
//
// One row per metric solves all three: each metric is in its own
// lane, but they share the time axis so a coach can scan vertically
// at any date to see "stress and pain both spiked the same week".
//
// Score rows render a line+area sparkline (0–10 y-scale, midline
// gridline at 5). Binary rows render a dot strip — filled dot = yes,
// hollow dot = no — so cadence is visible too.

import type { QuestionTrend, TrendPoint } from '@/lib/survey-trends';

interface Props {
  trends: QuestionTrend[];
}

const SCORE_COLOR = '#2563eb';   // blue for all score rows (no rainbow)
const BINARY_COLOR = '#ef4444';  // red for yes events

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function shortLabel(q: string, max = 60): string {
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
  isBinary: boolean;
  points: TrendPoint[];
  binaryPoints: TrendPoint[];
  count: number;
  last: TrendPoint | null;
  avg: number | null;
  yesCount: number;
}

function prepare(trends: QuestionTrend[]): Prepared[] {
  return [...trends]
    .sort((a, b) => b.points.length - a.points.length)
    .map((t) => {
      const isBinary = t.kind === 'binary';
      const binaryPoints = isBinary
        ? t.points.map((p) => ({ ts: p.ts, score: p.score >= 0.5 ? 1 : 0 }))
        : t.points;
      return {
        key: t.key,
        label: shortLabel(t.question),
        full: t.question,
        isBinary,
        points: t.points,
        binaryPoints,
        count: t.points.length,
        last: t.points.length ? t.points[t.points.length - 1] : null,
        avg: t.points.length
          ? t.points.reduce((a, b) => a + b.score, 0) / t.points.length
          : null,
        yesCount: isBinary
          ? binaryPoints.filter((p) => p.score === 1).length
          : 0,
      };
    });
}

const ROW_W = 760;
const ROW_PAD_L = 14;
const ROW_PAD_R = 14;
const SCORE_ROW_H = 64;
const BINARY_ROW_H = 28;
const AXIS_H = 28;

function ScoreRow({
  s,
  tMin,
  tRange,
  showMidline,
}: {
  s: Prepared;
  tMin: number;
  tRange: number;
  showMidline: boolean;
}) {
  const innerW = ROW_W - ROW_PAD_L - ROW_PAD_R;
  const PAD_T = 6;
  const PAD_B = 6;
  const innerH = SCORE_ROW_H - PAD_T - PAD_B;
  const xOf = (ts: string) =>
    ROW_PAD_L + ((new Date(ts).getTime() - tMin) / tRange) * innerW;
  const yOf = (v: number) => PAD_T + ((10 - v) / 10) * innerH;
  const sorted = [...s.points].sort((a, b) => a.ts.localeCompare(b.ts));
  const coords = sorted.map((p) => ({ x: xOf(p.ts), y: yOf(p.score) }));
  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
    .join(' ');
  const firstX = coords[0]?.x ?? 0;
  const lastX = coords[coords.length - 1]?.x ?? 0;
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${lastX} ${PAD_T + innerH} L ${firstX} ${PAD_T + innerH} Z`
      : '';

  return (
    <svg
      viewBox={`0 0 ${ROW_W} ${SCORE_ROW_H}`}
      className="block w-full"
      preserveAspectRatio="none"
      style={{ height: SCORE_ROW_H }}
    >
      {/* Top + bottom hair-line bounds */}
      <line
        x1={ROW_PAD_L}
        x2={ROW_W - ROW_PAD_R}
        y1={PAD_T}
        y2={PAD_T}
        stroke="var(--border)"
        strokeWidth={0.5}
        strokeOpacity={0.4}
      />
      <line
        x1={ROW_PAD_L}
        x2={ROW_W - ROW_PAD_R}
        y1={PAD_T + innerH}
        y2={PAD_T + innerH}
        stroke="var(--border)"
        strokeWidth={0.5}
        strokeOpacity={0.4}
      />
      {showMidline && (
        <line
          x1={ROW_PAD_L}
          x2={ROW_W - ROW_PAD_R}
          y1={yOf(5)}
          y2={yOf(5)}
          stroke="var(--border)"
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
      )}
      {/* y-axis labels at row edges */}
      <text
        x={ROW_PAD_L - 4}
        y={PAD_T + 4}
        textAnchor="end"
        style={{ fontSize: 8, fill: 'var(--ink-mute)' }}
        className="mono tabular"
      >
        10
      </text>
      <text
        x={ROW_PAD_L - 4}
        y={PAD_T + innerH + 2}
        textAnchor="end"
        style={{ fontSize: 8, fill: 'var(--ink-mute)' }}
        className="mono tabular"
      >
        0
      </text>
      {areaPath && <path d={areaPath} fill={SCORE_COLOR} fillOpacity={0.08} />}
      {coords.length > 1 && (
        <path
          d={linePath}
          fill="none"
          stroke={SCORE_COLOR}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {coords.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={2.5}
          fill="var(--card)"
          stroke={SCORE_COLOR}
          strokeWidth={1.5}
        >
          <title>
            {shortDate(new Date(sorted[i].ts))}: {sorted[i].score.toFixed(1)}/10
          </title>
        </circle>
      ))}
    </svg>
  );
}

function BinaryRow({
  s,
  tMin,
  tRange,
}: {
  s: Prepared;
  tMin: number;
  tRange: number;
}) {
  const innerW = ROW_W - ROW_PAD_L - ROW_PAD_R;
  const cy = BINARY_ROW_H / 2;
  const xOf = (ts: string) =>
    ROW_PAD_L + ((new Date(ts).getTime() - tMin) / tRange) * innerW;
  const yesPts = s.binaryPoints.filter((p) => p.score === 1);
  const noPts = s.binaryPoints.filter((p) => p.score === 0);

  return (
    <svg
      viewBox={`0 0 ${ROW_W} ${BINARY_ROW_H}`}
      className="block w-full"
      preserveAspectRatio="none"
      style={{ height: BINARY_ROW_H }}
    >
      <line
        x1={ROW_PAD_L}
        x2={ROW_W - ROW_PAD_R}
        y1={cy}
        y2={cy}
        stroke="var(--border)"
        strokeOpacity={0.5}
        strokeWidth={0.5}
      />
      {noPts.map((p, i) => (
        <circle
          key={`n-${i}`}
          cx={xOf(p.ts)}
          cy={cy}
          r={2.75}
          fill="none"
          stroke={BINARY_COLOR}
          strokeOpacity={0.4}
          strokeWidth={1}
        >
          <title>{shortDate(new Date(p.ts))}: no</title>
        </circle>
      ))}
      {yesPts.map((p, i) => (
        <circle
          key={`y-${i}`}
          cx={xOf(p.ts)}
          cy={cy}
          r={4.5}
          fill={BINARY_COLOR}
        >
          <title>{shortDate(new Date(p.ts))}: yes</title>
        </circle>
      ))}
    </svg>
  );
}

function DateAxis({ tMin, tRange }: { tMin: number; tRange: number }) {
  const TICK_COUNT = 5;
  const innerW = ROW_W - ROW_PAD_L - ROW_PAD_R;
  return (
    <svg
      viewBox={`0 0 ${ROW_W} ${AXIS_H}`}
      className="block w-full"
      preserveAspectRatio="none"
      style={{ height: AXIS_H }}
    >
      {Array.from({ length: TICK_COUNT }, (_, i) => {
        const t = tMin + (tRange * i) / (TICK_COUNT - 1);
        const x = ROW_PAD_L + (innerW * i) / (TICK_COUNT - 1);
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
              {shortDate(new Date(t))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SurveyTrendsCard({ trends }: Props) {
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

  // Shared time domain across ALL series so rows are date-aligned.
  const allTs: number[] = [];
  for (const s of series) for (const p of s.points) allTs.push(new Date(p.ts).getTime());
  const tMin = Math.min(...allTs);
  const tMax = Math.max(...allTs);
  const tRange = Math.max(tMax - tMin, 1);

  const scoreSeries = series.filter((s) => !s.isBinary);
  const binarySeries = series.filter((s) => s.isBinary);

  return (
    <Card>
      <Header
        title="Score trends"
        right={`${scoreSeries.length} score · ${binarySeries.length} yes/no`}
      />

      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {scoreSeries.map((s, i) => (
          <Row
            key={s.key}
            label={s.label}
            full={s.full}
            count={s.count}
            metaLeft={s.avg != null ? `avg ${s.avg.toFixed(1)}` : ''}
            metaRight={
              s.last
                ? `last ${s.last.score.toFixed(1)}/10 · ${shortDate(new Date(s.last.ts))}`
                : ''
            }
          >
            <ScoreRow
              s={s}
              tMin={tMin}
              tRange={tRange}
              showMidline={i === 0}
            />
          </Row>
        ))}

        {binarySeries.map((s) => (
          <Row
            key={s.key}
            label={s.label}
            full={s.full}
            count={s.count}
            metaLeft={`yes ${s.yesCount}/${s.count}`}
            metaRight={
              s.last
                ? `last ${s.last.score >= 0.5 ? 'yes' : 'no'} · ${shortDate(new Date(s.last.ts))}`
                : ''
            }
            tone="binary"
          >
            <BinaryRow s={s} tMin={tMin} tRange={tRange} />
          </Row>
        ))}

        {/* Shared date axis at the bottom of the panel */}
        <div className="px-6 pt-1 pb-3">
          <DateAxis tMin={tMin} tRange={tRange} />
        </div>
      </div>
    </Card>
  );
}

function Row({
  label,
  full,
  count,
  metaLeft,
  metaRight,
  tone,
  children,
}: {
  label: string;
  full: string;
  count: number;
  metaLeft: string;
  metaRight: string;
  tone?: 'binary';
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-3">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3
          className="text-[13px] font-semibold text-[color:var(--ink)] line-clamp-1 flex-1 min-w-0"
          title={full}
        >
          {label}
        </h3>
        <div className="flex items-baseline gap-3 shrink-0">
          <span className="mono text-[10.5px] text-[color:var(--ink-mute)] tabular">
            {count} replies
          </span>
          <span
            className="mono text-[11px] tabular font-semibold"
            style={{
              color: tone === 'binary' ? BINARY_COLOR : SCORE_COLOR,
            }}
          >
            {metaLeft}
          </span>
        </div>
      </div>
      {children}
      <div className="mt-1 mono text-[10px] text-[color:var(--ink-mute)] tabular text-right">
        {metaRight}
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
