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

type Chip = 'important' | 'all' | 'activity' | 'messages' | 'survey';

interface Props {
  logs: ActivityLog[];
  messages: TwilioMessage[];
  period: Period;
}

const CHIPS: Array<{ key: Chip; label: string }> = [
  { key: 'important', label: 'Important' },
  { key: 'all', label: 'All' },
  { key: 'activity', label: 'Activity' },
  { key: 'messages', label: 'Messages' },
  { key: 'survey', label: 'Survey' },
];

// Treat as noise on the "Important" view: Clerk verification SMS, the
// worker's onboarding/help template, the worker's "Workout logged!" /
// "Rehab logged!" confirmation echoes (the real activity_log row is
// already shown), and bare "test"/"testing" probes. Keep the regex list
// narrow — false positives here mean real messages get hidden.
function isNoise(e: TimelineEntry): boolean {
  const body = e.body.toLowerCase().trim();
  if (!body) return true;
  if (/verification code/.test(body)) return true;
  if (body.startsWith('to log a workout') || body.startsWith('to log rehab')) return true;
  if (body.startsWith('workout logged!') || body.startsWith('rehab logged!')) return true;
  if ((e.kind === 'inbound' || e.kind === 'outbound') && /^(test|testing|hi|hey|hello|ok|okay|yes|no|y|n)[.!?]?$/.test(body)) return true;
  return false;
}

// A survey row is "flagged" if the body starts with a small number — the
// athlete reported a low readiness reading. Drives the red side-stripe so
// these jump out of the feed.
function flaggedReadiness(e: TimelineEntry): number | null {
  if (e.kind !== 'survey') return null;
  const m = /^(\d{1,2})/.exec(e.body.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 && n <= 4 ? n : null;
}

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
  if (chip === 'important') return !isNoise(e);
  if (chip === 'all') return true;
  if (chip === 'activity') return e.kind === 'workout' || e.kind === 'rehab';
  if (chip === 'messages') return e.kind === 'inbound' || e.kind === 'outbound';
  if (chip === 'survey') return e.kind === 'survey';
  return true;
}

export function UnifiedTimeline({ logs, messages, period }: Props) {
  const [chip, setChip] = useState<Chip>('important');

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
            {filtered.map((e) => {
              const flag = flaggedReadiness(e);
              return (
                <li
                  key={e.id}
                  className="border-b px-5 py-3 last:border-0 relative"
                  style={{
                    borderColor: 'var(--border)',
                    background: flag != null
                      ? 'color-mix(in srgb, var(--red) 4%, transparent)'
                      : undefined,
                  }}
                >
                  {flag != null && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{ background: 'var(--red)' }}
                    />
                  )}
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
                        {flag != null && (
                          <Pill tone="red">{flag}/10</Pill>
                        )}
                      </div>
                      {e.body && (
                        <div className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--ink-soft)]">
                          {e.body}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}
