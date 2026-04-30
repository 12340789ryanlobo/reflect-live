'use client';

// Hero block for the unified athlete page. Readiness-led, AI sentence
// directly underneath, identity caption, period toggle, inline action row.
// Auto-fetches the AI summary when player or period changes; no
// "Generate" button. The freshness chip + refresh icon expose the cache.

import { useEffect, useRef, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
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
  lastInbound: string | null;
}

interface SummaryResult {
  summary: string;
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
}: Props) {
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
              {player.group ?? 'No group'} · ID {String(player.id).padStart(4, '0')}
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
            {summary && (
              <>
                <p className="text-[14px] leading-relaxed text-[color:var(--ink)]">
                  {summary.summary}
                </p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Pill tone={summary.generated_by === 'llm' ? 'blue' : 'mute'}>
                    {summary.generated_by === 'llm' ? 'LLM' : 'Rules'}
                  </Pill>
                  {summary.error && <Pill tone="amber">Fallback</Pill>}
                  {cachedAge && (
                    <span className="text-[11.5px] text-[color:var(--ink-mute)]">
                      Generated {cachedAge}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => forceRegen()}
                    disabled={loading}
                    aria-label="Regenerate summary"
                    className="ml-1 inline-flex items-center justify-center rounded-md border p-1 text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] disabled:opacity-50"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </>
            )}
          </div>
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
