'use client';

// Per-question score-over-time visualization for an athlete. Uses a
// dense bar sparkline (one bar per reply, equal spacing, no connecting
// line) instead of a dot-and-polyline chart — the polyline produced
// jagged "lollipop" zigzags when binary 0/1 replies were mixed with
// the occasional outlier (e.g. someone typing "6" to a yes/no q).
//
// Auto-detects two question shapes:
//   - binary    (max reply ≤ 1) → label "yes 30%", y-scale 0..1
//   - score     (otherwise)     → label "avg 6.1",  y-scale 0..10
// Bars are colored by tone (red 1-4, amber 5-6, green 7-10, mute 0).

import type { QuestionTrend, TrendPoint } from '@/lib/survey-trends';

interface Props {
  trends: QuestionTrend[];
  initialLimit?: number;
}

const W = 480;
const H = 44;
const PAD_X = 4;
const PAD_Y = 4;

function colorFor(score: number): string {
  if (score < 1) return 'var(--ink-mute)';
  const f = Math.floor(score);
  if (f <= 4) return 'var(--red)';
  if (f <= 6) return 'var(--amber)';
  return 'var(--green)';
}

function shortDate(ts: string): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isBinaryTrend(points: TrendPoint[]): boolean {
  // Treat as binary when every reply is 0 or 1 — typical of yes/no
  // surveys ("Did pain start? 0=no, 1=yes"). A single outlier (e.g. an
  // athlete misreads the prompt and types "6") would falsely scale the
  // chart to 0..10 and squash the meaningful 0/1 dots into the floor;
  // we only switch to the 0..10 scale when more than ~10% of replies
  // exceed 1, which is a more reliable "this is actually a 1-10
  // question" signal.
  if (points.length === 0) return false;
  const exceedsOne = points.filter((p) => p.score > 1).length;
  return exceedsOne / points.length <= 0.1;
}

function MiniChart({ trend, isBinary }: { trend: QuestionTrend; isBinary: boolean }) {
  const points = trend.points;
  if (points.length === 0) return null;
  const yMax = isBinary ? 1 : 10;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const N = points.length;
  const gap = N <= 30 ? 2 : 1;
  const barW = Math.max((innerW - (N - 1) * gap) / N, 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[44px]"
      preserveAspectRatio="none"
    >
      {/* Baseline track at the chart floor */}
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={H - PAD_Y}
        y2={H - PAD_Y}
        stroke="var(--border)"
        strokeWidth={0.5}
      />
      {points.map((p, i) => {
        const x = PAD_X + i * (barW + gap);
        // Even a 0 gets a tiny floor stub (1px) so it's still
        // distinguishable from "no reply on this date".
        const h = Math.max((p.score / yMax) * innerH, 1.5);
        const y = H - PAD_Y - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            fill={colorFor(p.score)}
            rx={Math.min(1, barW / 2)}
          >
            <title>
              {shortDate(p.ts)}: {p.score}{isBinary ? '' : '/10'}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

function TrendRow({ trend }: { trend: QuestionTrend }) {
  const points = trend.points;
  const scores = points.map((p) => p.score);
  const isBinary = isBinaryTrend(points);
  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = sum / scores.length;
  const last = points[points.length - 1];
  const first = points[0];
  // Binary: report yes-rate (the meaningful summary) instead of avg.
  const yesCount = scores.filter((s) => s >= 0.5).length;
  const yesPct = Math.round((yesCount / scores.length) * 100);

  const summary = isBinary ? `yes ${yesPct}%` : `avg ${avg.toFixed(1)}`;
  const summaryTone = isBinary
    ? yesPct >= 50
      ? 'var(--red)'
      : yesPct >= 25
        ? 'var(--amber)'
        : 'var(--green)'
    : colorFor(avg);

  const lastLabel = isBinary
    ? last.score >= 0.5
      ? 'yes'
      : 'no'
    : `${last.score}`;

  const dateRange =
    first.ts === last.ts
      ? shortDate(last.ts)
      : `${shortDate(first.ts)} → ${shortDate(last.ts)}`;

  return (
    <li className="px-6 py-4">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="text-[13px] font-semibold text-[color:var(--ink)] line-clamp-1 flex-1 min-w-0">
          {trend.question}
        </h3>
        <span className="mono text-[11px] text-[color:var(--ink-mute)] tabular shrink-0">
          {trend.points.length} {trend.points.length === 1 ? 'reply' : 'replies'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="shrink-0 mono text-[12px] font-semibold tabular w-[70px]"
          style={{ color: summaryTone }}
        >
          {summary}
        </div>
        <div className="flex-1 min-w-0">
          <MiniChart trend={trend} isBinary={isBinary} />
        </div>
        <div
          className="shrink-0 mono text-[11px] tabular w-[40px] text-right"
          style={{ color: colorFor(last.score) }}
          title={`last reply on ${shortDate(last.ts)}`}
        >
          {lastLabel}
        </div>
      </div>
      <div className="mt-1 mono text-[10px] text-[color:var(--ink-mute)] tabular">
        {dateRange}
      </div>
    </li>
  );
}

export function SurveyTrendsCard({ trends, initialLimit = 4 }: Props) {
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
          {trends.length === 0
            ? '0 questions'
            : `${visible.length} of ${trends.length} questions`}
        </span>
      </header>
      {trends.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--ink-mute)]">
            — no survey replies in this window —
          </p>
          <p className="mt-1 text-[11.5px] text-[color:var(--ink-mute)]">
            Replies that look like a 0–10 score will group by question and chart here.
          </p>
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {visible.map((t) => (
            <TrendRow key={t.key} trend={t} />
          ))}
        </ul>
      )}
    </section>
  );
}
