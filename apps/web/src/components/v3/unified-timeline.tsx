'use client';

// Merged activity_logs + twilio_messages feed with three fixed tabs:
// Competition inputs / Surveys / Messages.

import { useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Pill } from '@/components/v3/pill';
import { TwilioMediaStrip } from '@/components/v3/twilio-media-strip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type Period } from '@/lib/period';
import { pointLabel, defaultTab, type Tab } from '@/lib/timeline-tabs';
import {
  buildTimeline,
  type TimelineEntry,
  type TimelineKind,
} from '@/lib/timeline';
import { regionLabel } from '@/lib/injury-aliases';
import type { ActivityLog, TwilioMessage } from '@reflect-live/shared';
import { prettyDateTime, relativeTime } from '@/lib/format';

// Survey replies span multiple questions — readiness 1-10, energy
// 1-10, effort 1-10, injury yes/no (0 or 1), 'Enter 0 to skip', etc.
// Any bare numeric body (including decimals like 6.5 and yes/no 0/1)
// gets surfaced as a pill so the row reads consistently.
//
// Range: 0-10 inclusive. 0 covers 'no pain' / 'skip'; decimals cover
// half-step readiness scores. Anything outside 0-10 is probably noise
// (a phone digit, a typo) and falls through to body rendering.
function bareScore(body: string): number | null {
  const m = /^\s*(\d{1,2}(?:\.\d+)?)\s*$/.exec(body);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return n;
}

// Color encoding: low integers (1-4) are concerning, mid (5-6) is
// neutral, high (7-10) is positive. 0 is mute — for the 'no pain'
// or 'skip' case, low isn't bad. Decimals bucket by floor so 4.5 still
// flags red, 6.5 stays amber.
function scoreTone(n: number): 'red' | 'amber' | 'green' | 'mute' {
  if (n < 1) return 'mute';
  const f = Math.floor(n);
  if (f <= 4) return 'red';
  if (f <= 6) return 'amber';
  return 'green';
}

// Pill text: '6/10' for integers, '6.5/10' for decimals, just '0'
// for the yes/no / skip case (0/10 framing is misleading there).
function scoreLabel(n: number): string {
  if (n === 0) return '0';
  return `${n}/10`;
}


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
  /**
   * Per-entry delete handler. When provided AND canDelete returns true,
   * a trash icon renders on the row and clicking it dispatches to the
   * right backend (activity_logs vs self-report) via this callback.
   * The parent owns optimistic UI removal.
   */
  onDelete?: (entry: TimelineEntry) => void;
  /**
   * Predicate the row renderer calls to decide whether to show the
   * trash icon for a given entry. Centralizes the athlete-self /
   * coach-any policy at the parent so this component doesn't need
   * permission context.
   */
  canDelete?: (entry: TimelineEntry) => boolean;
  /** kind→points map from the active competition, for the Competition
   *  inputs tab's point labels. Omit if no active competition. */
  scoring?: Record<string, number>;
  /** True if the team has an active competition today — feeds the
   *  dynamic default-tab choice. */
  hasActiveCompetition?: boolean;
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'competition', label: 'Competition inputs' },
  { key: 'surveys', label: 'Surveys' },
  { key: 'messages', label: 'Messages' },
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
  // Survey reminder nudges — '[Session] Hey {first}! Reminder to
  // finish your check-in. Reply to continue where you left off.'
  // These are scaffolding, not questions.
  /reminder to finish your check-in/i,
  /where you left off/i,
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
  if (n == null) return null;
  // 0 is the 'no pain' / 'skip' answer — low number, but not concerning.
  if (n < 1) return null;
  return Math.floor(n) <= 4 ? n : null;
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

function entryMatchesTab(e: TimelineEntry, tab: Tab): boolean {
  if (tab === 'competition') return e.kind === 'workout' || e.kind === 'rehab';
  if (tab === 'surveys') return e.kind === 'survey';
  if (tab === 'messages') {
    // Messages = plain inbound/outbound chat, with the OTP/scaffolding
    // noise hidden by default (same filter the old 'Important' view used).
    return (e.kind === 'inbound' || e.kind === 'outbound') && !isNoise(e);
  }
  return false;
}

export function UnifiedTimeline({
  logs,
  messages,
  period,
  selectedRegions,
  onClearRegionFilter,
  onDelete,
  canDelete,
  scoring,
  hasActiveCompetition,
}: Props) {

  // Drop hidden messages defensively — DB query already filters, but
  // Realtime UPDATE events for hidden=true should disappear without
  // a refetch.
  const visibleMessages = useMemo(
    () => messages.filter((m) => !m.hidden),
    [messages],
  );

  const all = useMemo(() => buildTimeline(logs, visibleMessages), [logs, visibleMessages]);

  // Per-tab entry counts (after noise filtering for messages) drive the
  // header badges and the dynamic default-tab choice.
  const counts = useMemo(() => {
    let competition = 0;
    let surveys = 0;
    let messages = 0;
    for (const e of all) {
      if (e.pairedWithReply) continue; // paired outbound questions render inline
      if (entryMatchesTab(e, 'competition')) competition++;
      else if (entryMatchesTab(e, 'surveys')) surveys++;
      else if (entryMatchesTab(e, 'messages')) messages++;
    }
    return { competition, surveys, messages };
  }, [all]);

  const initialTab = useMemo(
    () =>
      defaultTab({
        hasActiveCompetition: hasActiveCompetition ?? false,
        competitionCount: counts.competition,
        surveyCount: counts.surveys,
        messageCount: counts.messages,
      }),
    // Only the FIRST computed value matters — the user can switch freely
    // after. Recomputing on every count change would yank their tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [tab, setTab] = useState<Tab>(initialTab);

  // Region filter: when the user has clicked a muscle on the body
  // heatmap, narrow to entries whose parsed regions overlap. Composes
  // with the tab filter — both must pass.
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
        if (!entryMatchesTab(e, tab)) return false;
        if (regionSet) {
          // Empty regions or no overlap → exclude.
          if (e.regions.length === 0) return false;
          if (!e.regions.some((r) => regionSet.has(r))) return false;
        }
        return true;
      }),
    [all, tab, regionSet],
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
        <h2 className="text-base font-bold text-[color:var(--ink)]">Activity</h2>
        <div
          className="inline-flex rounded-md border overflow-hidden"
          style={{ borderColor: 'var(--border)' }}
          role="radiogroup"
          aria-label="Timeline section"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            const count =
              t.key === 'competition' ? counts.competition
              : t.key === 'surveys' ? counts.surveys
              : counts.messages;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                  active
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]'
                }`}
              >
                {t.label} · {count}
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
            {regionSet
              ? '— no entries match this region in the current view —'
              : tab === 'competition' ? '— no competition inputs yet —'
              : tab === 'surveys' ? '— no surveys yet —'
              : '— no messages yet —'}
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
                  className="group border-b px-5 py-3 last:border-0 relative"
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
                        {tab === 'competition' && e.activityKind ? (
                          <Pill tone={KIND_TONE[e.kind]}>
                            {e.activityKind}
                            {pointLabel(e.activityKind, scoring) && (
                              <span className="opacity-70"> · {pointLabel(e.activityKind, scoring)}</span>
                            )}
                          </Pill>
                        ) : (
                          <Pill tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Pill>
                        )}
                        {score != null && (
                          <Pill tone={scoreTone(score)}>{scoreLabel(score)}</Pill>
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
                    {onDelete && canDelete?.(e) && tab !== 'messages' && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onDelete(e);
                        }}
                        className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)] transition opacity-0 group-hover:opacity-100 shrink-0"
                        aria-label="Hide this entry"
                        title="Hide this entry"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
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
