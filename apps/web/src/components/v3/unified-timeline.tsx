'use client';

// Merged activity_logs + twilio_messages feed with a chip filter row.
// Default chip is 'all' — interleaved by timestamp desc.

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Pill } from '@/components/v3/pill';
import { TwilioMediaStrip } from '@/components/v3/twilio-media-strip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type Period, periodLabel } from '@/lib/period';
import {
  buildTimeline,
  type TimelineEntry,
  type TimelineKind,
} from '@/lib/timeline';
import { regionLabel } from '@/lib/injury-aliases';
import type { ActivityLog, TwilioMessage } from '@reflect-live/shared';
import { prettyDateTime, relativeTime } from '@/lib/format';

// Survey replies span multiple questions — readiness 1-10, energy
// 1-10, effort 1-10, injury yes/no, focus area free-text, etc. We
// can't assume a bare digit means readiness. But ANY 1-10 numeric
// reply is best surfaced as a colored score pill rather than a
// stranded number in the body — color encodes urgency without
// claiming to know the question.
function bareScore(body: string): number | null {
  const m = /^\s*(\d{1,2})\s*$/.exec(body);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return n;
}

function scoreTone(n: number): 'red' | 'amber' | 'green' {
  if (n <= 4) return 'red';
  if (n <= 6) return 'amber';
  return 'green';
}

type Chip = 'important' | 'all' | 'activity' | 'messages' | 'survey';

interface Props {
  logs: ActivityLog[];
  messages: TwilioMessage[];
  period: Period;
  /**
   * Region keys the timeline is currently filtered to (driven by clicks
   * on the body heatmap). Only entries whose `regions` overlap with
   * this set survive. Empty / undefined = no filter.
   */
  selectedRegions?: string[];
  /** Called when the user clears the region filter from the banner. */
  onClearRegionFilter?: () => void;
}

const CHIPS: Array<{ key: Chip; label: string }> = [
  { key: 'important', label: 'Important' },
  { key: 'all', label: 'All' },
  { key: 'activity', label: 'Activity' },
  { key: 'messages', label: 'Messages' },
  { key: 'survey', label: 'Survey' },
];

// Body-content patterns that match worker-generated SMS scaffolding
// (verification codes, onboarding templates, account-setup links,
// auto-replies). Hidden from the "Important" view because they're
// not athlete signal.
//
// NOTE: survey-question patterns used to live here too, but the
// pairing logic in lib/timeline.ts now hides outbound questions
// when they get paired with a reply. Unpaired questions (no answer
// yet) stay visible so coaches can see what's pending — that's
// useful signal, not noise. Don't add question patterns back here.
//
// Bias: keep each pattern narrow. False positives hide real messages.
const NOISE_BODY_PATTERNS: RegExp[] = [
  // Clerk OTP / 2FA codes
  /verification code/i,
  // Worker text-to-SMS help template
  /^to log a workout/i,
  /^to log rehab/i,
  // Worker confirmation echoes (canonical row is already shown)
  /^workout logged!/i,
  /^rehab logged!/i,
  // Reflect (legacy) account-setup invitation + link
  /set up your reflect account/i,
  /setup-password\?token=/i,
  // Auto thank-you replies the worker sends after a check-in
  /^thanks for checking in/i,
];

// Bare-probe replies (single-word chat that's almost always noise).
const NOISE_BARE_PROBE = /^(test|testing|hi|hey|hello|ok|okay|yes|no|y|n)[.!?]?$/i;

function isNoise(e: TimelineEntry): boolean {
  const body = e.body.trim();
  if (!body) return true;
  for (const re of NOISE_BODY_PATTERNS) {
    if (re.test(body)) return true;
  }
  if ((e.kind === 'inbound' || e.kind === 'outbound') && NOISE_BARE_PROBE.test(body)) return true;
  return false;
}

// A survey-numeric row is "flagged" if the score is 1-4 (low). Drives
// the red side-stripe so these jump out of the feed regardless of
// which scaled question they're answering — low effort, low energy,
// and low readiness all warrant the coach's attention.
function flaggedScore(e: TimelineEntry): number | null {
  if (e.kind !== 'survey') return null;
  const n = bareScore(e.body);
  return n != null && n <= 4 ? n : null;
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

export function UnifiedTimeline({
  logs,
  messages,
  period,
  selectedRegions,
  onClearRegionFilter,
}: Props) {
  const [chip, setChip] = useState<Chip>('important');

  const all = useMemo(() => buildTimeline(logs, messages), [logs, messages]);

  // Region filter: when the user has clicked a muscle on the body
  // heatmap, narrow to entries whose parsed regions overlap. Composes
  // with the chip filter — both must pass.
  const regionSet = useMemo(
    () => (selectedRegions && selectedRegions.length > 0 ? new Set(selectedRegions) : null),
    [selectedRegions],
  );
  const filtered = useMemo(
    () =>
      all.filter((e) => {
        // Outbound questions that got paired with an inbound reply
        // are rendered inline with the answer (Q: ...). Hide the
        // standalone outbound row to avoid duplication. Unpaired
        // outbounds (no reply yet) still surface — coaches want to
        // see pending questions.
        if (e.pairedWithReply) return false;
        if (!entryMatchesChip(e, chip)) return false;
        if (regionSet) {
          // Empty regions or no overlap → exclude.
          if (e.regions.length === 0) return false;
          if (!e.regions.some((r) => regionSet.has(r))) return false;
        }
        return true;
      }),
    [all, chip, regionSet],
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

      {regionSet && (
        <div
          className="flex items-center justify-between gap-3 px-6 py-2 border-b text-[12px]"
          style={{ borderColor: 'var(--border)', background: 'var(--blue-soft)' }}
        >
          <span className="text-[color:var(--ink-soft)]">
            Filtered by:{' '}
            <span className="font-semibold text-[color:var(--ink)]">
              {Array.from(regionSet).map(regionLabel).join(', ')}
            </span>
          </span>
          {onClearRegionFilter && (
            <button
              type="button"
              onClick={onClearRegionFilter}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] transition"
            >
              <X className="size-3" /> Clear
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--ink-mute)]">
            {regionSet ? '— no entries match this region in the current view —' : '— no entries in this view —'}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[440px]">
          <ul>
            {filtered.map((e) => {
              const flagScore = flaggedScore(e);
              const score = e.kind === 'survey' ? bareScore(e.body) : null;
              const hasMedia = e.messageSid && e.mediaSids && e.mediaSids.length > 0;
              // Render rule: when the answer IS the score (bare number
              // like '10', 'unique answer pill above does the work), drop
              // the body to avoid showing the same number twice. For text
              // replies and mixed bodies, render normally.
              const skipBody = score != null;
              return (
                <li
                  key={e.id}
                  className="border-b px-5 py-3 last:border-0 relative"
                  style={{
                    borderColor: 'var(--border)',
                    background: flagScore != null
                      ? 'color-mix(in srgb, var(--red) 4%, transparent)'
                      : undefined,
                  }}
                >
                  {flagScore != null && (
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
                        {score != null && (
                          <Pill tone={scoreTone(score)}>{score}/10</Pill>
                        )}
                      </div>
                      {e.pairedQuestion && (
                        <div className="mt-1.5 text-[12.5px] leading-snug text-[color:var(--ink-mute)]">
                          <span className="font-semibold text-[color:var(--ink-soft)] mr-1.5">Q:</span>
                          {e.pairedQuestion}
                        </div>
                      )}
                      {e.body && !skipBody && (
                        <div className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--ink-soft)]">
                          {e.pairedQuestion && (
                            <span className="font-semibold text-[color:var(--ink-mute)] mr-1.5">A:</span>
                          )}
                          {e.body}
                        </div>
                      )}
                      {hasMedia && (
                        <div className="mt-2">
                          <TwilioMediaStrip
                            messageSid={e.messageSid}
                            mediaSids={e.mediaSids}
                          />
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
