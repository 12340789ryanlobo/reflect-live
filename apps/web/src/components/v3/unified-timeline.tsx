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
// can't assume a bare digit is the readiness score (it might be
// effort, team energy, anything). All we know is "this is a survey
// reply"; let the body speak for itself. For bare-number replies,
// we visually pad them so a stranded "10" reads as an intentional
// answer rather than a typo.
function isBareNumericReply(body: string): boolean {
  return /^\d{1,2}\s*$/.test(body.trim());
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
// (verification codes, onboarding templates, survey-question prompts,
// account-setup links, auto-replies). Hidden from the "Important" view
// because they're not athlete signal.
//
// Bias: keep each pattern narrow. False positives here hide real
// messages. If a pattern starts catching legit chat, narrow it.
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
  // Survey-question prompts — recognised by the "Reply: 0 = no, 1 = yes"
  // / "Reply 1-10" / "(1 = very poorly, 10 = very well)" instruction tail.
  /\breply\s*[:\-]?\s*(?:0\s*=|1\s*=|1\s*[-–]\s*10)/i,
  /\(\s*\d+\s*=\s*\w+\s*,\s*\d+\s*=\s*\w+\s*\)/i,
  // Body-readiness ask
  /provide your body readiness score/i,
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
                      {e.pairedQuestion && (
                        <div className="mt-1.5 text-[12.5px] leading-snug text-[color:var(--ink-mute)] italic">
                          <span className="not-italic font-semibold mr-1.5">Q:</span>
                          {e.pairedQuestion}
                        </div>
                      )}
                      {e.body && (() => {
                        // Survey replies that are just a bare number
                        // get a slightly larger / mono treatment so a
                        // stranded '10' reads as the intentional answer
                        // it is, not a typo. The paired question above
                        // (when found) gives the context — readiness vs
                        // energy vs effort etc.
                        const isAnswer = e.kind === 'survey' && !!e.pairedQuestion;
                        if (e.kind === 'survey' && isBareNumericReply(e.body)) {
                          return (
                            <div className={`mono ${isAnswer ? 'mt-0.5' : 'mt-1.5'} text-[18px] font-semibold tabular text-[color:var(--ink)]`}>
                              {isAnswer && (
                                <span className="font-semibold mr-1.5 text-[color:var(--ink-mute)] text-[14px] not-italic">A:</span>
                              )}
                              {e.body.trim()}
                            </div>
                          );
                        }
                        return (
                          <div className={`text-[14px] leading-relaxed text-[color:var(--ink-soft)] ${isAnswer ? 'mt-0.5' : 'mt-1.5'}`}>
                            {isAnswer && (
                              <span className="font-semibold mr-1.5 text-[color:var(--ink-mute)]">A:</span>
                            )}
                            {e.body}
                          </div>
                        );
                      })()}
                      {e.messageSid && e.mediaSids && e.mediaSids.length > 0 && (
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
