'use client';

// "Generate summary" card for a single player. POSTs to
// /api/players/:id/summary, renders the structured result inline.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/v3/pill';
import { PeriodToggle } from '@/components/v3/period-toggle';
import { periodKey, type Period } from '@/lib/period';
import { Sparkles } from 'lucide-react';

interface SummaryResult {
  summary: string;
  observations: string[];
  recommendations: string[];
  citations: string[];
  generated_by: 'llm' | 'rules';
  confidence: 'low' | 'medium' | 'high';
  from_cache?: boolean;
  error?: string;
}

interface Props {
  playerId: number;
}

export function PlayerSummaryCard({ playerId }: Props) {
  const [days, setDays] = useState<Period>(14);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/players/${playerId}/summary?days=${periodKey(days)}`, { method: 'POST' });
      if (!r.ok) {
        setError(`Request failed (${r.status}). Try again or contact admin.`);
        setResult(null);
        return;
      }
      const j = (await r.json()) as SummaryResult;
      setResult(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[color:var(--blue)]" />
          <h2 className="text-base font-bold text-[color:var(--ink)]">AI summary</h2>
        </div>
        <div className="flex items-center gap-2">
          <PeriodToggle value={days} onChange={setDays} disabled={loading} />
          <Button size="sm" onClick={generate} disabled={loading} className="font-bold">
            {loading ? 'Generating…' : result ? 'Regenerate' : 'Generate'}
          </Button>
        </div>
      </header>

      <div className="px-6 py-5">
        {!result && !loading && !error && (
          <p className="text-[13px] text-[color:var(--ink-mute)]">
            Click <span className="font-semibold">Generate</span> for a data-driven readout
            {days === 'all' ? ' across all recorded check-ins' : ` of the last ${days} days`}.
            Numbers and flags only — no fluff.
          </p>
        )}

        {loading && (
          <p className="text-[13px] text-[color:var(--ink-mute)]">— crunching numbers —</p>
        )}

        {error && (
          <p className="text-[13px]" style={{ color: 'var(--red)' }}>
            {error}
          </p>
        )}

        {result && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={result.generated_by === 'llm' ? 'blue' : 'mute'}>
                {result.generated_by === 'llm' ? 'LLM' : 'Rules'}
              </Pill>
              <Pill
                tone={
                  result.confidence === 'high' ? 'green' : result.confidence === 'low' ? 'amber' : 'mute'
                }
              >
                Confidence: {result.confidence}
              </Pill>
              {result.from_cache && <Pill tone="mute">Cached</Pill>}
              {result.error && <Pill tone="amber">Fallback</Pill>}
            </div>
            {result.error && (
              <details className="rounded-md border bg-[color:var(--paper)] px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                <summary className="cursor-pointer text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                  Why no LLM? (click to expand)
                </summary>
                <pre className="mt-2 mono text-[11px] text-[color:var(--ink-soft)] whitespace-pre-wrap break-all">{result.error}</pre>
              </details>
            )}

            <p className="text-[14px] leading-relaxed text-[color:var(--ink)]">{result.summary}</p>

            {result.observations.length > 0 && (
              <div>
                <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] mb-2">
                  Observations
                </h3>
                <ul className="space-y-1.5">
                  {result.observations.map((o, i) => (
                    <li
                      key={i}
                      className="text-[13px] text-[color:var(--ink-soft)] pl-4 relative before:absolute before:left-0 before:top-[0.55em] before:size-1 before:rounded-full before:bg-[color:var(--ink-mute)]"
                    >
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.recommendations.length > 0 && (
              <div>
                <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] mb-2">
                  Actions
                </h3>
                <ul className="space-y-1.5">
                  {result.recommendations.map((r, i) => (
                    <li
                      key={i}
                      className="text-[13px] text-[color:var(--ink-soft)] pl-4 relative before:absolute before:left-0 before:top-[0.55em] before:size-1 before:rounded-full before:bg-[color:var(--blue)]"
                    >
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.citations.length > 0 && (
              <p className="mono text-[11px] text-[color:var(--ink-mute)] tabular">
                Cited dates: {result.citations.join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
