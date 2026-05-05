'use client';

// Mini dashboard preview rendered on the landing page — same visual
// chrome as the real /dashboard, but driven by static demo data so we
// don't need supabase / auth / a team to populate it.
//
// State: a single `period` selection. All numbers (readiness, message
// count, active, flags, response rate, score-trend cell strips,
// needs-attention list) derive from one PERIOD_DATA lookup so the
// preview is internally consistent — pick 30d and the messages count,
// flags count, response rate, AND the cell history all grow together,
// rather than the previous hard-coded 7d-only snapshot that didn't
// match its own period chip.

import { useMemo, useState } from 'react';
import { NumberTicker } from '@/components/ui/number-ticker';
import { BorderBeam } from '@/components/ui/border-beam';
import { AttentionList } from '@/components/v3/landing-attention-list';

type Period = '7d' | '14d' | '30d' | 'all';
const PERIODS: readonly Period[] = ['7d', '14d', '30d', 'all'] as const;

interface PeriodData {
  /** How many cells render in each Score-trends row. Higher = thinner
   *  cells, matches the real product's behavior of compressing the
   *  history strip when the period grows. */
  cellCount: number;
  /** Plain-English subtitle for the Messages stat ("last 7 days"). */
  windowLabel: string;
  /** Team-mean readiness across the period, 0–10. Drives the gauge
   *  number, the bar fill, and the tone label. */
  readiness: number;
  /** Number of survey-readiness responses received in the period —
   *  shown as the small caption next to the gauge. */
  surveyResponses: number;
  /** Score-trend row averages. Decimals shown to one place. */
  sleepAvg: number;
  rpeAvg: number;
  /** Stat-strip values. */
  messages: number;
  activePlayers: number;
  rosterSize: number;
  responseRate: number;
  flags: number;
  /** Cell strips for each metric. Length === cellCount. null = no
   *  reply that day (faint empty cell). The values are the team-mean
   *  for that day. */
  readinessCells: Array<number | null>;
  sleepCells: Array<number | null>;
  rpeCells: Array<number | null>;
  /** Needs-attention rows. Same shape AttentionList expects. */
  attention: Array<{ name: string; tag: string; tone: 'amber' | 'red' }>;
}

// Pre-built per-period snapshots. Numbers here are coherent with each
// other within each row — e.g. 30d's flags count is roughly 4× the 7d
// count, response rates plateau as more athletes get a chance to
// reply, etc. Each cells array is shaped to look like a realistic
// week/fortnight/month of survey data — quiet weekends, dips midweek,
// occasional null days. The 'all' period reduces cell density to 30
// so the strip stays readable without scrolling.
const PERIOD_DATA: Record<Period, PeriodData> = {
  '7d': {
    cellCount: 7,
    windowLabel: 'last 7 days',
    readiness: 7.4,
    surveyResponses: 19,
    sleepAvg: 6.8,
    rpeAvg: 6.1,
    messages: 412,
    activePlayers: 22,
    rosterSize: 24,
    responseRate: 92,
    flags: 2,
    readinessCells: [7, 8, null, 6, 8, 9, 7],
    sleepCells:     [7, 6, null, 5, 7, 7, 8],
    rpeCells:       [5, 6, null, 7, 6, 5, 6],
    attention: [
      { name: 'Sam Rivera', tag: 'Group · no replies in 4 days', tone: 'amber' },
      { name: 'Jordan Kim', tag: 'Group · no replies in 6 days', tone: 'red' },
    ],
  },
  '14d': {
    cellCount: 14,
    windowLabel: 'last 14 days',
    readiness: 7.2,
    surveyResponses: 38,
    sleepAvg: 6.7,
    rpeAvg: 6.4,
    messages: 841,
    activePlayers: 23,
    rosterSize: 24,
    responseRate: 96,
    flags: 4,
    readinessCells: [8, 7, null, 7, 6, 8, 9, 7, 8, null, 6, 8, 7, 7],
    sleepCells:     [6, 7, null, 7, 6, 6, 8, 7, 6, null, 5, 7, 7, 7],
    rpeCells:       [6, 6, null, 5, 7, 6, 5, 6, 7, null, 6, 6, 5, 7],
    attention: [
      { name: 'Sam Rivera', tag: 'Group · no replies in 4 days', tone: 'amber' },
      { name: 'Jordan Kim', tag: 'Group · no replies in 9 days', tone: 'red' },
      { name: 'Casey Park', tag: 'Group · low readiness 3 of last 5', tone: 'amber' },
    ],
  },
  '30d': {
    cellCount: 30,
    windowLabel: 'last 30 days',
    readiness: 7.0,
    surveyResponses: 78,
    sleepAvg: 6.6,
    rpeAvg: 6.7,
    messages: 1832,
    activePlayers: 24,
    rosterSize: 24,
    responseRate: 100,
    flags: 8,
    readinessCells: [
      7, 8, null, 7, 8, 6, 7, 8, 6, 7,
      null, 7, 8, 7, 6, 7, 8, null, 6, 8,
      7, 7, 8, 9, 7, null, 6, 7, 7, 8,
    ],
    sleepCells: [
      7, 6, null, 6, 7, 6, 5, 7, 6, 6,
      null, 7, 7, 6, 5, 6, 7, null, 5, 7,
      7, 6, 6, 8, 7, null, 5, 6, 7, 7,
    ],
    rpeCells: [
      6, 7, null, 6, 7, 5, 6, 7, 8, 7,
      null, 6, 5, 6, 7, 7, 6, null, 7, 6,
      5, 7, 7, 6, 6, null, 8, 7, 6, 6,
    ],
    attention: [
      { name: 'Sam Rivera', tag: 'Group · 6 quiet days this month', tone: 'amber' },
      { name: 'Jordan Kim', tag: 'Group · low readiness streak', tone: 'red' },
      { name: 'Casey Park', tag: 'Group · sleep ≤5 four times', tone: 'amber' },
    ],
  },
  all: {
    cellCount: 30, // compress to 30 buckets so the strip stays readable
    windowLabel: 'all time',
    readiness: 6.9,
    surveyResponses: 217,
    sleepAvg: 6.5,
    rpeAvg: 6.9,
    messages: 4127,
    activePlayers: 24,
    rosterSize: 24,
    responseRate: 98,
    flags: 14,
    readinessCells: [
      7, 7, 8, 7, null, 6, 7, 8, 7, 7,
      6, 7, null, 8, 7, 7, 8, 6, 7, 7,
      null, 8, 7, 7, 6, 7, 8, 7, 7, 7,
    ],
    sleepCells: [
      6, 6, 7, 6, null, 5, 7, 7, 6, 6,
      5, 6, null, 7, 6, 7, 7, 6, 6, 7,
      null, 7, 6, 6, 5, 6, 7, 6, 7, 6,
    ],
    rpeCells: [
      6, 7, 6, 7, null, 7, 6, 7, 7, 8,
      7, 6, null, 7, 7, 6, 6, 7, 8, 7,
      null, 6, 7, 7, 7, 6, 7, 7, 6, 7,
    ],
    attention: [
      { name: 'Jordan Kim', tag: 'Repeated low readiness', tone: 'red' },
      { name: 'Sam Rivera', tag: 'Sporadic responder', tone: 'amber' },
    ],
  },
};

// Continuous red→amber→green gradient mirroring SurveyTrendsCard.
// Null reads as a faint empty cell — same convention the real
// heatmap uses for 'no reply that day.'
function cellColor(v: number | null): string {
  if (v == null) return 'var(--paper-2)';
  let hue: number;
  if (v <= 5) hue = ((v - 1) / 4) * 38;
  else hue = 38 + ((v - 5) / 5) * (145 - 38);
  return `hsl(${hue.toFixed(0)}, 78%, 48%)`;
}

// Tone label for the readiness gauge — matches the real dashboard's
// thresholds (≤4 red flag, ≤6 watch, ≥7 healthy).
function readinessTone(v: number): { label: string; color: string; barPct: number } {
  if (v <= 4) return { label: 'At risk', color: 'var(--red)', barPct: Math.round(v * 10) };
  if (v <= 6) return { label: 'Watch', color: 'var(--amber)', barPct: Math.round(v * 10) };
  return { label: 'Healthy', color: 'var(--green)', barPct: Math.round(v * 10) };
}

export function LandingDashboardPreview() {
  const [period, setPeriod] = useState<Period>('7d');
  const data = PERIOD_DATA[period];
  const tone = useMemo(() => readinessTone(data.readiness), [data.readiness]);

  return (
    <div
      className="relative rounded-2xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <BorderBeam size={120} duration={9} colorFrom="#1F5FB0" colorTo="#3F7AC4" />
      <BorderBeam size={120} duration={9} delay={4.5} colorFrom="#3F7AC4" colorTo="#1F5FB0" />

      {/* Window chrome — header + period chips */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">Today</div>
          <div className="text-[16px] font-bold text-[color:var(--ink)]">Dashboard</div>
        </div>
        <div className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide">
          {PERIODS.map((p) => {
            const active = p === period;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="px-2 py-1 rounded transition focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
                style={{
                  background: active ? 'var(--ink)' : 'transparent',
                  color: active ? 'var(--paper)' : 'var(--ink-mute)',
                }}
                aria-pressed={active}
                aria-label={`Show ${p === 'all' ? 'all time' : `last ${p}`}`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_2fr] gap-6">
        {/* Readiness gauge */}
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: 'var(--border)', background: 'var(--paper)' }}
        >
          <div
            className="text-[10.5px] uppercase tracking-wide font-bold"
            style={{ color: tone.color }}
          >
            Team readiness
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <NumberTicker
              value={data.readiness}
              decimalPlaces={1}
              delay={0.05}
              className="text-[3rem] font-bold leading-none text-[color:var(--ink)]"
            />
            <span className="text-[14px] text-[color:var(--ink-mute)] tabular">/ 10</span>
          </div>
          <div
            className="mt-3 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--border)' }}
          >
            <div
              className="h-full transition-[width] duration-500"
              style={{ width: `${tone.barPct}%`, background: tone.color }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[10.5px] uppercase tracking-wide font-semibold">
            <span style={{ color: tone.color }}>{tone.label}</span>
            <span className="text-[color:var(--ink-mute)] tabular">
              {data.surveyResponses} responses
            </span>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-3 divide-x rounded-xl border" style={{ borderColor: 'var(--border)' }}>
          <Stat label="Messages" value={data.messages} sub={data.windowLabel} tone="blue" />
          <Stat
            label="Active"
            value={data.activePlayers}
            valueSuffix={` / ${data.rosterSize}`}
            sub={`${data.responseRate}% response rate`}
            tone="ink"
          />
          <Stat label="Flags" value={data.flags} sub="readiness ≤ 4" tone="red" />
        </div>
      </div>

      {/* Score trends */}
      <div className="border-t px-6 py-5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-bold text-[color:var(--ink)]">Score trends</div>
          <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
            3 score · 1 yes/no
          </div>
        </div>
        <div className="space-y-2">
          <TrendRow label="Readiness" avg={data.readiness} cells={data.readinessCells} />
          <TrendRow label="Sleep"     avg={data.sleepAvg}  cells={data.sleepCells} />
          <TrendRow label="RPE"       avg={data.rpeAvg}    cells={data.rpeCells} />
        </div>
      </div>

      {/* Needs attention */}
      <div className="border-t px-6 py-5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-bold text-[color:var(--ink)]">Needs attention</div>
          <span
            className="text-[10.5px] uppercase tracking-wide font-bold text-white px-1.5 py-0.5 rounded"
            style={{ background: data.attention.length >= 3 ? 'var(--red)' : 'var(--amber)' }}
          >
            {data.attention.length} {data.attention.length === 1 ? 'flag' : 'flags'}
          </span>
        </div>
        {/* Re-key by period so the staggered entrance plays again on
            switch. Without this, switching periods just swaps the
            text and feels static. */}
        <AttentionList key={period} rows={data.attention} />
      </div>
    </div>
  );
}

function TrendRow({
  label,
  avg,
  cells,
}: {
  label: string;
  avg: number;
  cells: Array<number | null>;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <div>
        <div className="text-[12.5px] font-semibold text-[color:var(--ink)]">{label}</div>
        <div className="text-[10.5px] mono tabular text-[color:var(--ink-mute)]">avg {avg.toFixed(1)}</div>
      </div>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
      >
        {cells.map((c, i) => (
          <span
            key={i}
            className="h-4 rounded-sm transition-colors duration-300"
            style={{ background: cellColor(c) }}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: number;
  valueSuffix?: string;
  sub: string;
  tone: 'blue' | 'ink' | 'red';
}

function Stat({ label, value, valueSuffix, sub, tone }: StatProps) {
  const valueColor = tone === 'blue' ? 'var(--blue)' : tone === 'red' ? 'var(--red)' : 'var(--ink)';
  return (
    <div className="p-5" style={{ borderColor: 'var(--border)' }}>
      <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">{label}</div>
      <div
        className="mt-1 text-[1.75rem] font-bold leading-none flex items-baseline gap-0.5"
        style={{ color: valueColor }}
      >
        <NumberTicker value={value} delay={0.1} />
        {valueSuffix && <span className="tabular text-[1.25rem]">{valueSuffix}</span>}
      </div>
      <div className="mt-1 text-[11px] text-[color:var(--ink-mute)]">{sub}</div>
    </div>
  );
}
