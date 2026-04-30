'use client';

// Three-mode body-map card: Injury / Activity / Rehab.
// Wraps the existing <BodyHeatmap> and swaps `counts` per tab. The side
// list shows the top items for the active tab.

import { useMemo, useState } from 'react';
import { BodyHeatmap } from '@/components/v3/body-heatmap';
import { Pill } from '@/components/v3/pill';
import { regionLabel } from '@/lib/injury-aliases';
import type { Gender } from '@reflect-live/shared';

export type HeatmapTab = 'injury' | 'activity' | 'rehab';

export interface InjurySideRow {
  id: number;
  regions: string[];
  severity: number | null;
  description: string;
  reportedAt: string;
}

interface Props {
  injuryCounts: Record<string, number>;
  activityCounts: Record<string, number>;
  rehabCounts: Record<string, number>;
  injuryRows: InjurySideRow[];
  gender: Gender;
}

const TABS: Array<{ key: HeatmapTab; label: string }> = [
  { key: 'injury', label: 'Injury' },
  { key: 'activity', label: 'Activity' },
  { key: 'rehab', label: 'Rehab' },
];

// Side-list caps. Injuries are higher-signal so we show more; activity/rehab
// counts can have a long tail.
const TOP_REGION_LIMIT = 8;
const INJURY_ROW_LIMIT = 10;

function topRegions(counts: Record<string, number>, limit = TOP_REGION_LIMIT): Array<[string, number]> {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export function HeatmapTabs({
  injuryCounts,
  activityCounts,
  rehabCounts,
  injuryRows,
  gender,
}: Props) {
  const [tab, setTab] = useState<HeatmapTab>('injury');

  const counts =
    tab === 'injury' ? injuryCounts : tab === 'activity' ? activityCounts : rehabCounts;

  // Side-list rows for activity/rehab. The injury tab uses `injuryRows` directly.
  const topByCount = useMemo(
    () => (tab === 'injury' ? null : topRegions(counts)),
    [tab, counts],
  );

  return (
    <section
      className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b flex-wrap"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-bold text-[color:var(--ink)]">Body map</h2>
        <div
          className="inline-flex rounded-md border overflow-hidden"
          style={{ borderColor: 'var(--border)' }}
          role="radiogroup"
          aria-label="Heatmap mode"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTab(t.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                  active
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="grid gap-6 px-6 py-6 md:grid-cols-[minmax(0,620px)_minmax(0,420px)]">
        <div className="flex flex-col gap-3">
          <BodyHeatmap
            counts={counts}
            gender={gender}
            scale={0.85}
            className="w-full"
          />
          {/* Density legend — relative to this athlete's max in the
              current view. Discrete circles in the saturated brand
              palette so the colors are legible at this size; the body
              silhouette itself uses softer tints, but legends
              conventionally read brighter than the data they describe.
              Tab-aware label so the viewer knows what's being counted. */}
          <div className="flex items-center gap-3 flex-wrap text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
            <span>{tab === 'injury' ? 'Flags' : 'Sessions'}</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-3.5 rounded-full"
                style={{ background: 'var(--paper-2)', boxShadow: 'inset 0 0 0 1px var(--border)' }}
              />
              None
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3.5 rounded-full" style={{ background: 'var(--green)' }} />
              Low
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3.5 rounded-full" style={{ background: '#E0A030' }} />
              Mid
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3.5 rounded-full" style={{ background: 'var(--amber)' }} />
              High
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3.5 rounded-full" style={{ background: 'var(--red)' }} />
              Hot
            </span>
          </div>
        </div>
        <div className="min-w-0">
          {tab === 'injury' ? (
            injuryRows.length === 0 ? (
              <p className="text-[13px] text-[color:var(--ink-mute)] py-8 text-center">
                No active injuries — clean bill of health.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {injuryRows.slice(0, INJURY_ROW_LIMIT).map((r) => (
                  <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {r.regions.map((reg) => (
                        <Pill key={reg} tone="mute">{regionLabel(reg)}</Pill>
                      ))}
                      {r.severity != null && (
                        <Pill tone={r.severity >= 4 ? 'red' : r.severity >= 3 ? 'amber' : 'green'}>
                          sev {r.severity}
                        </Pill>
                      )}
                    </div>
                    <p className="text-[13px] text-[color:var(--ink-soft)]">{r.description}</p>
                  </li>
                ))}
              </ul>
            )
          ) : topByCount && topByCount.length === 0 ? (
            <p className="text-[13px] text-[color:var(--ink-mute)] py-8 text-center">
              No {tab} hits in this period.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {topByCount?.map(([region, n]) => (
                <li key={region} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between">
                  <span className="text-[13px] text-[color:var(--ink)]">{regionLabel(region)}</span>
                  <span className="mono tabular text-[12px] text-[color:var(--ink-mute)]">
                    {n} session{n === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
