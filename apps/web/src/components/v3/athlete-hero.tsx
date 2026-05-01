'use client';

// Hero block for the unified athlete page. Readiness-led, AI sentence
// directly underneath, identity caption, period toggle, inline action row.
// Auto-fetches the AI summary when player or period changes; no
// "Generate" button. The freshness chip + refresh icon expose the cache.

import { useEffect, useRef, useState } from 'react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { Pill } from '@/components/v3/pill';
import { PeriodToggle } from '@/components/v3/period-toggle';
import { ReadinessBar } from '@/components/v3/readiness-bar';
import { type Period, periodKey } from '@/lib/period';
import { prettyPhone, relativeTime } from '@/lib/format';
import type { Player } from '@reflect-live/shared';

interface Derived {
  avgReadiness: number | null;
  responses: number;
  flags: number;
  /** Workout activity_logs in the current period — gives the athlete
   *  a personal counter mirroring the team-wide loggers stat on
   *  /dashboard/fitness. */
  workouts: number;
  /** Rehab activity_logs in the current period. */
  rehabs: number;
  lastInbound: string | null;
}

interface SummaryResult {
  summary: string;
  observations?: string[];
  recommendations?: string[];
  citations?: string[];
  generated_by: 'llm' | 'rules';
  confidence: 'low' | 'medium' | 'high';
  from_cache?: boolean;
  cached_at?: string;
  error?: string;
}

export type ActionVerb =
  | 'text'
  | 'log_workout'
  | 'mark_injury_resolved'
  | 'self_report'
  | 'report_injury';

interface Props {
  player: Player;
  derived: Derived;
  period: Period;
  onPeriodChange: (p: Period) => void;
  viewerIsSelf: boolean;
  showPhone: boolean;
  onAction: (verb: ActionVerb) => void;
  /** Athlete's place on the team leaderboard for the configured
   *  competition window — 1-indexed. Null when the athlete has no
   *  scored activity (or no roster mates). */
  seasonRank?: number | null;
  /** Total ranked athletes for the same window. Lets the hero render
   *  '#3 / 18' rather than just '#3'. */
  seasonRankTotal?: number | null;
  /** ISO date the season counts from (team.competition_start_date),
   *  or null for all-time ranking. Drives the small caption below the
   *  rank pill. */
  seasonStart?: string | null;
}

function statusFor(hours: number | null): { tone: 'green' | 'amber' | 'mute'; text: string } {
  if (hours == null) return { tone: 'mute', text: 'quiet' };
  if (hours < 1) return { tone: 'green', text: 'live' };
  if (hours < 24) return { tone: 'green', text: 'on wire' };
  if (hours < 72) return { tone: 'amber', text: 'watch' };
  return { tone: 'mute', text: 'quiet' };
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export function AthleteHero({
  player,
  derived,
  period,
  onPeriodChange,
  viewerIsSelf,
  showPhone,
  onAction,
  seasonRank = null,
  seasonRankTotal = null,
  seasonStart = null,
}: Props) {
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inFlightRef.current?.abort();
    const ac = new AbortController();
    inFlightRef.current = ac;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const qs = new URLSearchParams({ days: periodKey(period) });
        const r = await fetch(`/api/players/${player.id}/summary?${qs}`, {
          method: 'POST',
          signal: ac.signal,
        });
        if (!r.ok) {
          if (!ac.signal.aborted) setErr(`Request failed (${r.status}).`);
          return;
        }
        const j = (await r.json()) as SummaryResult;
        if (!ac.signal.aborted) setSummary(j);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [player.id, period]);

  async function forceRegen() {
    inFlightRef.current?.abort();
    const ac = new AbortController();
    inFlightRef.current = ac;
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ days: periodKey(period), force: '1' });
      const r = await fetch(`/api/players/${player.id}/summary?${qs}`, {
        method: 'POST',
        signal: ac.signal,
      });
      if (!r.ok) {
        if (!ac.signal.aborted) setErr(`Request failed (${r.status}).`);
        return;
      }
      const j = (await r.json()) as SummaryResult;
      if (!ac.signal.aborted) setSummary(j);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }

  const status = statusFor(hoursSince(derived.lastInbound));
  const cachedAge = summary?.cached_at ? relativeTime(summary.cached_at) : null;

  const actions: Array<{ verb: ActionVerb; label: string }> = viewerIsSelf
    ? [
        { verb: 'self_report', label: 'Self-report' },
        { verb: 'log_workout', label: 'Log workout' },
        { verb: 'report_injury', label: 'Report injury' },
      ]
    : [
        { verb: 'text', label: 'Text' },
        { verb: 'log_workout', label: 'Log workout' },
        { verb: 'mark_injury_resolved', label: 'Mark injury resolved' },
      ];

  return (
    <section className="reveal reveal-1 grid gap-6 lg:grid-cols-12">
      {/* Identity caption — left */}
      <div
        className="rounded-2xl bg-[color:var(--card)] border p-6 lg:col-span-4 flex flex-col gap-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="grid size-12 place-items-center rounded-md border bg-[color:var(--paper)] text-[14px] font-bold"
            style={{ borderColor: 'var(--border)' }}
          >
            {player.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[18px] font-bold text-[color:var(--ink)] truncate">{player.name}</div>
            <div className="text-[12px] text-[color:var(--ink-mute)]">
              {player.group ?? 'No group'}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[color:var(--ink-mute)]">Status</span>
          <Pill tone={status.tone}>{status.text}</Pill>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[color:var(--ink-mute)]">Last on wire</span>
          <span className="mono tabular text-[color:var(--ink-soft)]">
            {derived.lastInbound ? relativeTime(derived.lastInbound) : '—'}
          </span>
        </div>
        {showPhone && (
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[color:var(--ink-mute)]">Phone</span>
            <span className="mono tabular text-[color:var(--ink-soft)]">{prettyPhone(player.phone_e164)}</span>
          </div>
        )}
        {/* Competition rank — visible to everyone viewing the page so
            athletes can see where they sit and use it as motivation. */}
        <div
          className="flex items-center justify-between text-[12px] border-t pt-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-[color:var(--ink-mute)]">
            {seasonStart ? 'Season rank' : 'Rank'}
          </span>
          {seasonRank != null ? (
            <span className="font-bold text-[color:var(--ink)]">
              #{seasonRank}
              {seasonRankTotal != null && (
                <span className="font-medium text-[color:var(--ink-mute)] ml-1">
                  / {seasonRankTotal}
                </span>
              )}
            </span>
          ) : (
            <span className="mono tabular text-[color:var(--ink-mute)]">unranked</span>
          )}
        </div>
        {seasonStart && (
          <p className="text-[10.5px] text-[color:var(--ink-dim)] tabular -mt-2">
            since {seasonStart}
          </p>
        )}
      </div>

      {/* Readiness + AI sentence (dominant) — right */}
      <div
        className="rounded-2xl bg-[color:var(--card)] border p-6 lg:col-span-8 flex flex-col gap-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <ReadinessBar
            value={derived.avgReadiness}
            responses={derived.responses}
            flagged={derived.flags}
            size="md"
            title="Readiness"
          />
          <PeriodToggle value={period} onChange={onPeriodChange} />
        </div>

        <div className="flex items-start gap-3">
          <Sparkles className="size-4 mt-1 shrink-0 text-[color:var(--blue)]" />
          <div className="min-w-0 flex-1">
            {loading && !summary && (
              <p className="text-[13px] text-[color:var(--ink-mute)]">— generating —</p>
            )}
            {err && !summary && (
              <p className="text-[13px]" style={{ color: 'var(--red)' }}>{err}</p>
            )}
            {summary && (() => {
              const hasObs = (summary.observations?.length ?? 0) > 0;
              const hasRecs = (summary.recommendations?.length ?? 0) > 0;
              const hasDetail = hasObs || hasRecs;
              return (
                <>
                  <p className="text-[14px] leading-relaxed text-[color:var(--ink)]">
                    {summary.summary}
                  </p>
                  {hasDetail && detailsOpen && (
                    <div className="mt-3 space-y-3">
                      {hasObs && (
                        <div>
                          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--ink-mute)] mb-1.5">
                            Observations
                          </div>
                          <ul className="space-y-1">
                            {summary.observations!.map((o, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-[13px] leading-snug text-[color:var(--ink-soft)]"
                              >
                                <span className="mt-[7px] size-1 rounded-full bg-[color:var(--blue)] shrink-0" />
                                <span>{o}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {hasRecs && (
                        <div>
                          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--ink-mute)] mb-1.5">
                            Recommended actions
                          </div>
                          <ul className="space-y-1">
                            {summary.recommendations!.map((r, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-[13px] leading-snug text-[color:var(--ink-soft)]"
                              >
                                <ArrowRight className="size-3 mt-[3px] shrink-0 text-[color:var(--blue)]" />
                                <span>{r}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Pill tone={summary.generated_by === 'llm' ? 'blue' : 'mute'}>
                      {summary.generated_by === 'llm' ? 'LLM' : 'Rules'}
                    </Pill>
                    <Pill tone={summary.confidence === 'high' ? 'green' : summary.confidence === 'medium' ? 'amber' : 'mute'}>
                      {summary.confidence} confidence
                    </Pill>
                    {summary.error && <Pill tone="amber">Fallback</Pill>}
                    {cachedAge && (
                      <span className="text-[11.5px] text-[color:var(--ink-mute)]">
                        Generated {cachedAge}
                      </span>
                    )}
                    {hasDetail && (
                      <button
                        type="button"
                        onClick={() => setDetailsOpen((v) => !v)}
                        aria-expanded={detailsOpen}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]"
                      >
                        {detailsOpen ? (
                          <>Hide analysis <ChevronUp className="size-3" /></>
                        ) : (
                          <>View analysis <ChevronDown className="size-3" /></>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => forceRegen()}
                      disabled={loading}
                      aria-label="Regenerate summary"
                      className="ml-auto inline-flex items-center justify-center rounded-md border p-1 text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] disabled:opacity-50"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Period totals — personal counters mirroring the team
            'Active loggers' / 'Workouts' stats on /dashboard/fitness. */}
        <div
          className="flex items-center gap-6 flex-wrap border-t pt-3 text-[12px] text-[color:var(--ink-mute)] tabular"
          style={{ borderColor: 'var(--border)' }}
        >
          <span>
            <span className="font-bold text-[color:var(--ink)] text-[16px] mr-1.5">{derived.workouts}</span>
            workout{derived.workouts === 1 ? '' : 's'}
          </span>
          <span>
            <span className="font-bold text-[color:var(--ink)] text-[16px] mr-1.5">{derived.rehabs}</span>
            rehab{derived.rehabs === 1 ? '' : 's'}
          </span>
          <span>
            <span className="font-bold text-[color:var(--ink)] text-[16px] mr-1.5">{derived.responses}</span>
            survey{derived.responses === 1 ? '' : 's'}
          </span>
          {derived.flags > 0 && (
            <span style={{ color: 'var(--red)' }}>
              <span className="font-bold text-[16px] mr-1.5">{derived.flags}</span>
              flag{derived.flags === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* Inline action row */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {actions.map((a) => (
            <button
              key={a.verb}
              type="button"
              onClick={() => onAction(a.verb)}
              className="rounded-md border px-3 py-1.5 text-[12px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] hover:border-[color:var(--blue)] transition"
              style={{ borderColor: 'var(--border)' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
