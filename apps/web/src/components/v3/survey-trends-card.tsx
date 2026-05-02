'use client';

// Per-question score-over-time chart for an athlete. Renders one
// small SVG chart per distinct survey question, with dots colored by
// score (red 1-4, amber 5-6, green 7-10). Designed to make trends
// visible at a glance — coach can see "readiness has been declining
// for three days" without parsing the timeline row by row.
//
// Custom SVG instead of a chart lib because we don't have one
// installed and the chart shape is dead simple — we just need
// dots-on-a-line over a horizontal time axis.

import type { QuestionTrend, TrendPoint } from '@/lib/survey-trends';

interface Props {
  trends: QuestionTrend[];
  /** Display only the top N questions; rest collapse below a 'show more'. */
  initialLimit?: number;
}

const W = 480; // intrinsic SVG width (scales with viewBox)
const H = 60;  // chart height (excluding label)
const PAD_X = 8;
const PAD_Y = 6;

function colorFor(score: number): string {
  if (score < 1) return 'var(--ink-mute)';
  const f = Math.floor(score);
  if (f <= 4) return 'var(--red)';
  if (f <= 6) return 'var(--amber)';
  return 'var(--green)';
}

function MiniChart({ trend }: { trend: QuestionTrend }) {
  const points = trend.points;
  if (points.length === 0) return null;
  const tsValues = points.map((p) => new Date(p.ts).getTime());
  const tMin = Math.min(...tsValues);
  const tMax = Math.max(...tsValues);
  const tRange = tMax - tMin || 1;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  function x(p: TrendPoint): number {
    return PAD_X + ((new Date(p.ts).getTime() - tMin) / tRange) * innerW;
  }
  function y(score: number): number {
    return PAD_Y + ((10 - score) / 10) * innerH;
  }
  const avg = points.reduce((s, p) => s + p.score, 0) / points.length;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[60px]" preserveAspectRatio="none">
      {/* Y gridlines at 5 (amber) and (visually) the chart bounds */}
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={y(5)}
        y2={y(5)}
        stroke="var(--border)"
        strokeDasharray="2 3"
        strokeWidth={1}
      />
      {/* Connecting line through points */}
      {points.length > 1 && (
        <polyline
          fill="none"
          stroke="var(--ink-dim)"
          strokeWidth={1}
          points={points.map((p) => `${x(p)},${y(p.score)}`).join(' ')}
        />
      )}
      {/* Dots */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(p)}
          cy={y(p.score)}
          r={3}
          fill={colorFor(p.score)}
        >
          <title>
            {new Date(p.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            {' · '}{p.score}/10
          </title>
        </circle>
      ))}
      {/* Latest score callout, anchored to the last dot */}
      <text
        x={x(last)}
        y={y(last.score) - 6}
        textAnchor="end"
        className="mono"
        style={{ fontSize: 10, fontWeight: 600, fill: colorFor(last.score) }}
      >
        {last.score}
      </text>
      {/* Avg label, top-left corner */}
      <text
        x={PAD_X}
        y={PAD_Y + 8}
        className="mono"
        style={{ fontSize: 9, fill: 'var(--ink-mute)' }}
      >
        avg {avg.toFixed(1)}
      </text>
    </svg>
  );
}

export function SurveyTrendsCard({ trends, initialLimit = 4 }: Props) {
  if (trends.length === 0) return null;
  const visible = trends.slice(0, initialLimit);
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
          {visible.length} of {trends.length} questions
        </span>
      </header>
      <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {visible.map((t) => (
          <li key={t.key} className="px-6 py-4">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h3 className="text-[13px] font-semibold text-[color:var(--ink)] line-clamp-2">
                {t.question}
              </h3>
              <span className="mono text-[11px] text-[color:var(--ink-mute)] tabular shrink-0">
                {t.points.length} replies
              </span>
            </div>
            <MiniChart trend={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}
