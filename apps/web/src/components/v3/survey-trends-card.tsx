'use client';

// Calendar-heatmap visualization of an athlete's survey replies.
//
// Layout: each row is question stats (HTML, left) + a CSS-grid cell
// strip (right). Using CSS grid for cells instead of a stretched SVG
// keeps cells properly proportioned regardless of container width —
// the previous SVG approach with preserveAspectRatio='none' smeared
// cells horizontally on wide screens.
//
// Cells:
//   - score (0-10):  continuous red→amber→green gradient
//   - binary (0/1):  filled red dot = yes, hollow = no
//   - no reply:      faint dot
//
// Period window comes from the page's existing toggle:
//   - numeric (7/14/30/90): trailing window from today
//   - 'all': from first-ever reply through today (no cap)
//
// See docs/superpowers/specs/2026-05-02-score-trends-heatmap-design.md

import type { Period } from '@/lib/period';
import type { QuestionTrend, TrendPoint } from '@/lib/survey-trends';

interface Props {
  trends: QuestionTrend[];
  period: Period;
}

const RED = '#ef4444';
const MUTE_BORDER = 'var(--ink-mute)';

// Continuous red→amber→green gradient over 1..10. The two-leg HSL
// interpolation keeps the midline anchored at amber/5 (matches the
// existing palette so 'around 5 = warning' reads consistently across
// the app), while the rest of the scale flows smoothly.
function scoreTone(v: number): string {
  if (v < 1) return 'var(--ink-mute)';
  const c = Math.min(10, v);
  let hue: number;
  if (c <= 5) hue = ((c - 1) / 4) * 38;          // 1..5 → 0..38
  else hue = 38 + ((c - 5) / 5) * (145 - 38);    // 5..10 → 38..145
  return `hsl(${hue.toFixed(0)}, 78%, 48%)`;
}

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
  rawCount: number;
  rawAvg: number;
  rawYesCount: number;
  byDay: Map<string, number>;
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

// Time window for the heatmap.
//   - numeric period:  trailing window from today
//   - 'all':           from earliest reply across all metrics → today.
//                       No cap. If data is sparse, cells get small but
//                       cadence stays honest. The user picks 'all' to
//                       see everything; we honor that.
function windowFor(period: Period, trends: Prepared[]): { from: number; to: number } {
  const now = Date.now();
  if (period !== 'all') {
    return { from: now - period * 86400_000, to: now };
  }
  const allTs: number[] = [];
  for (const t of trends)
    for (const k of t.byDay.keys()) allTs.push(new Date(`${k}T12:00:00Z`).getTime());
  if (allTs.length === 0) return { from: now - 30 * 86400_000, to: now };
  return { from: Math.min(...allTs), to: now };
}

const ROW_H = 28;
const STATS_W_PX = 300;

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
            {totalReplies} {totalReplies === 1 ? 'reply' : 'replies'} on file. Try a longer period.
          </p>
        </div>
      ) : (
        <div className="px-2 md:px-4 py-4 overflow-x-auto">
          <div className="min-w-[540px]">
            {scoreSeries.map((s) => (
              <Row key={s.key} series={s} days={days} />
            ))}
            {scoreSeries.length > 0 && binarySeries.length > 0 && (
              <div className="my-1 mx-6 border-t" style={{ borderColor: 'var(--border)' }} />
            )}
            {binarySeries.map((s) => (
              <Row key={s.key} series={s} days={days} />
            ))}
            <DateAxis days={days} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ series, days }: { series: Prepared; days: string[] }) {
  const last = series.lastReply;
  const lastTone = last
    ? series.isBinary
      ? last.score >= 0.5
        ? RED
        : 'var(--ink-mute)'
      : scoreTone(last.score)
    : 'var(--ink-mute)';
  const lastLabel = last
    ? series.isBinary
      ? last.score >= 0.5
        ? 'yes'
        : 'no'
      : last.score.toFixed(1)
    : '–';

  const stat = series.isBinary
    ? `${series.rawYesCount}/${series.rawCount} yes · ${series.rawCount === 0 ? 0 : Math.round((series.rawYesCount / series.rawCount) * 100)}%`
    : `avg ${series.rawAvg.toFixed(1)} · ${series.rawCount} ${series.rawCount === 1 ? 'reply' : 'replies'}`;

  return (
    <div className="flex items-center px-4">
      {/* Stats column */}
      <div
        className="flex items-center gap-3 pr-4 shrink-0"
        style={{ width: STATS_W_PX }}
      >
        <div className="min-w-0 flex-1">
          <div
            className="text-[12.5px] font-semibold text-[color:var(--ink)] truncate leading-snug"
            title={series.full}
          >
            {series.full}
          </div>
          <div className="mono text-[10.5px] text-[color:var(--ink-mute)] tabular leading-snug">
            {stat}
          </div>
        </div>
        <div
          className="mono text-[12px] tabular font-semibold shrink-0 leading-tight text-right"
          style={{ color: lastTone, minWidth: 36 }}
          title={last ? `last reply on ${shortDate(new Date(last.ts))}` : ''}
        >
          {lastLabel}
        </div>
      </div>

      {/* Cell grid — CSS grid so cells stay properly sized */}
      <div
        className="flex-1 min-w-0 grid gap-[1.5px]"
        style={{
          gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
          height: ROW_H,
        }}
      >
        {days.map((d) => (
          <Cell key={d} day={d} series={series} />
        ))}
      </div>
    </div>
  );
}

function Cell({ day, series }: { day: string; series: Prepared }) {
  const v = series.byDay.get(day);
  const dateLabel = shortDate(new Date(`${day}T12:00:00Z`));

  if (v == null) {
    return (
      <div
        className="flex items-center justify-center"
        title={`${dateLabel}: no reply`}
      >
        <div
          className="rounded-full"
          style={{
            width: 3,
            height: 3,
            background: 'var(--border)',
            opacity: 0.55,
          }}
        />
      </div>
    );
  }

  if (series.isBinary) {
    const isYes = v >= 0.5;
    return (
      <div
        className="flex items-center justify-center"
        title={`${dateLabel}: ${isYes ? 'yes' : 'no'}`}
      >
        {isYes ? (
          <div
            className="rounded-full"
            style={{ width: 10, height: 10, background: RED }}
          />
        ) : (
          <div
            className="rounded-full border"
            style={{ width: 8, height: 8, borderColor: MUTE_BORDER }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      title={`${dateLabel}: ${v.toFixed(1)}/10`}
      className="rounded-[3px]"
      style={{
        background: scoreTone(v),
        // Keep cells from getting absurdly tall in tight rows; they'll
        // shrink horizontally with grid 1fr but always read as squares.
        margin: '2px 0',
        opacity: 0.92,
      }}
    />
  );
}

function DateAxis({ days }: { days: string[] }) {
  const TICK_COUNT = 5;
  // Pick evenly-spaced day indices for the labels. Matches the cell
  // grid columns so labels visually line up under the right cells.
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) =>
    Math.round(((days.length - 1) * i) / (TICK_COUNT - 1)),
  );
  return (
    <div className="flex items-center px-4 mt-1.5">
      <div className="shrink-0" style={{ width: STATS_W_PX, paddingRight: 16 }} />
      <div
        className="flex-1 min-w-0 grid"
        style={{
          gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        {days.map((d, i) => {
          const tickIdx = ticks.indexOf(i);
          if (tickIdx === -1) return <div key={d} />;
          const align: 'flex-start' | 'center' | 'flex-end' =
            tickIdx === 0
              ? 'flex-start'
              : tickIdx === TICK_COUNT - 1
                ? 'flex-end'
                : 'center';
          return (
            <div
              key={d}
              className="mono text-[10px] tabular text-[color:var(--ink-mute)] flex"
              style={{
                gridColumn: i + 1,
                justifyContent: align,
                whiteSpace: 'nowrap',
              }}
            >
              {shortDate(new Date(`${d}T12:00:00Z`))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Top-of-card legend so cell tones are immediately legible.
function ScaleLegend() {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
          Score
        </span>
        <div className="flex items-center gap-1.5">
          <span className="mono text-[10px] tabular text-[color:var(--ink-mute)]">1</span>
          <div
            className="rounded-full"
            style={{
              width: 140,
              height: 8,
              background:
                'linear-gradient(90deg,' +
                [1, 2.5, 4, 5, 6, 7.5, 9, 10]
                  .map((v) => scoreTone(v))
                  .join(',') +
                ')',
            }}
          />
          <span className="mono text-[10px] tabular text-[color:var(--ink-mute)]">10</span>
        </div>
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
            style={{ width: 9, height: 9, borderColor: MUTE_BORDER }}
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
