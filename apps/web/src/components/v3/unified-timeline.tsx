'use client';

// Merged activity_logs + twilio_messages feed with a chip filter row.
// Default chip is 'all' — interleaved by timestamp desc.

import { useMemo, useState } from 'react';
import { Pill } from '@/components/v3/pill';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type Period, periodLabel } from '@/lib/period';
import {
  buildTimeline,
  type TimelineEntry,
  type TimelineKind,
} from '@/lib/timeline';
import type { ActivityLog, TwilioMessage } from '@reflect-live/shared';
import { prettyDateTime, relativeTime } from '@/lib/format';

type Chip = 'all' | 'activity' | 'messages' | 'survey';

interface Props {
  logs: ActivityLog[];
  messages: TwilioMessage[];
  period: Period;
}

const CHIPS: Array<{ key: Chip; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'activity', label: 'Activity' },
  { key: 'messages', label: 'Messages' },
  { key: 'survey', label: 'Survey' },
];

const KIND_TONE: Record<TimelineKind, 'green' | 'amber' | 'blue' | 'mute'> = {
  workout: 'green',
  rehab: 'amber',
  survey: 'blue',
  inbound: 'mute',
  outbound: 'mute',
};

const KIND_LABEL: Record<TimelineKind, string> = {
  workout: 'workout',
  rehab: 'rehab',
  survey: 'survey',
  inbound: 'inbound',
  outbound: 'outbound',
};

function entryMatchesChip(e: TimelineEntry, chip: Chip): boolean {
  if (chip === 'all') return true;
  if (chip === 'activity') return e.kind === 'workout' || e.kind === 'rehab';
  if (chip === 'messages') return e.kind === 'inbound' || e.kind === 'outbound';
  if (chip === 'survey') return e.kind === 'survey';
  return true;
}

export function UnifiedTimeline({ logs, messages, period }: Props) {
  const [chip, setChip] = useState<Chip>('all');

  const all = useMemo(() => buildTimeline(logs, messages), [logs, messages]);
  const filtered = useMemo(
    () => all.filter((e) => entryMatchesChip(e, chip)),
    [all, chip],
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
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-bold text-[color:var(--ink)]">Activity &amp; messages</h2>
          <span className="text-[12px] text-[color:var(--ink-mute)]">
            {filtered.length} {periodLabel(period).toLowerCase()}
          </span>
        </div>
        <div
          className="inline-flex rounded-md border overflow-hidden"
          style={{ borderColor: 'var(--border)' }}
          role="radiogroup"
          aria-label="Filter timeline"
        >
          {CHIPS.map((c) => {
            const active = chip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChip(c.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                  active
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--ink-mute)]">— no entries in this view —</p>
        </div>
      ) : (
        <ScrollArea className="h-[440px]">
          <ul>
            {filtered.map((e) => (
              <li
                key={e.id}
                className="border-b px-5 py-3 last:border-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-[88px] text-right">
                    <div
                      className="mono text-[11px] tabular text-[color:var(--ink-mute)]"
                      title={prettyDateTime(e.ts)}
                    >
                      {relativeTime(e.ts)}
                    </div>
                  </div>
                  <div className="shrink-0 w-px self-stretch bg-[color:var(--border)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Pill>
                    </div>
                    {e.body && (
                      <div className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--ink-soft)]">
                        {e.body}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}
