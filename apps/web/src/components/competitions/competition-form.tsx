'use client';

// Shared form for /dashboard/competitions/new and
// /dashboard/competitions/[id]/edit. Owns its own state for the
// editable rows so the two pages stay thin shells that just hand in
// initial values + tell us whether to POST or PATCH.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, Plus } from 'lucide-react';
import type { Competition } from '@reflect-live/shared';

interface ScoringRow {
  id: number;
  kind: string;
  points: string;
}
interface BonusRow {
  id: number;
  kind: string;
  min_per_day: string;
  bonus_points: string;
  mode: 'reward' | 'penalize';
}

function nextId(prev: { id: number }[]): number {
  return prev.reduce((m, r) => Math.max(m, r.id), 0) + 1;
}

interface SubmitOk {
  ok: true;
  competition: Competition;
}
interface SubmitErr {
  ok: false;
  error: string;
}
type SubmitResult = SubmitOk | SubmitErr;

export interface CompetitionFormProps {
  mode: 'create' | 'edit';
  /** Pre-fill state for edit mode. Ignored on create. */
  initial?: Competition;
  /** Headline above the form (page-specific copy). */
  cancelHref: string;
  /** Where to redirect after a successful submit. */
  successHref: (compId: number) => string;
  submitLabel?: { idle: string; busy: string };
  /** The actual POST/PATCH call. Form handles validation; this just does I/O. */
  onSubmit: (payload: {
    name: string;
    starts_at: string;
    ends_at: string;
    scoring: Record<string, number>;
    bonus_rules: Array<{ kind: string; min_per_day: number; bonus_points: number }>;
  }) => Promise<SubmitResult>;
}

/** Map a stored Competition into the editable-row shape we use here. */
function rowsFromCompetition(c?: Competition): { name: string; starts: string; ends: string; scoring: ScoringRow[]; bonus: BonusRow[] } {
  if (!c) {
    return {
      name: 'Summer 2026',
      starts: '2026-06-01',
      ends: '2026-09-20',
      scoring: [
        { id: 1, kind: 'swim',    points: '2' },
        { id: 2, kind: 'workout', points: '1' },
        { id: 3, kind: 'rehab',   points: '0.6' },
      ],
      bonus: [
        { id: 1, kind: 'swim', min_per_day: '2', bonus_points: '1', mode: 'penalize' },
      ],
    };
  }
  const scoring = Object.entries(c.scoring).map(([kind, points], i) => ({
    id: i + 1,
    kind,
    points: String(points),
  }));
  const bonus = c.bonus_rules.map((r, i) => ({
    id: i + 1,
    kind: r.kind,
    min_per_day: String(r.min_per_day),
    bonus_points: String(Math.abs(r.bonus_points)),
    mode: (r.bonus_points >= 0 ? 'reward' : 'penalize') as 'reward' | 'penalize',
  }));
  return {
    name: c.name,
    starts: c.starts_at,
    ends: c.ends_at,
    scoring: scoring.length > 0 ? scoring : [{ id: 1, kind: '', points: '1' }],
    bonus,
  };
}

export function CompetitionForm({
  initial,
  cancelHref,
  successHref,
  submitLabel = { idle: 'Save', busy: 'Saving…' },
  onSubmit,
}: CompetitionFormProps) {
  const router = useRouter();
  const seed = rowsFromCompetition(initial);
  const [name, setName] = useState(seed.name);
  const [startsAt, setStartsAt] = useState(seed.starts);
  const [endsAt, setEndsAt] = useState(seed.ends);
  const [scoring, setScoring] = useState<ScoringRow[]>(seed.scoring);
  const [bonus, setBonus] = useState<BonusRow[]>(seed.bonus);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);

    // Build scoring map; skip rows with empty kind / unparseable points.
    const scoringMap: Record<string, number> = {};
    for (const r of scoring) {
      const k = r.kind.trim().toLowerCase();
      const v = Number(r.points);
      if (!k) continue;
      if (!Number.isFinite(v)) { setErr(`Points for "${k}" must be a number.`); return; }
      scoringMap[k] = v;
    }
    if (Object.keys(scoringMap).length === 0) {
      setErr('Add at least one scored activity kind.');
      return;
    }

    // Build bonus rules. mode controls the sign so coaches think in
    // positive magnitudes; we apply +/- at the boundary.
    const bonusRules: Array<{ kind: string; min_per_day: number; bonus_points: number }> = [];
    for (const r of bonus) {
      const k = r.kind.trim().toLowerCase();
      if (!k) continue;
      const min = Number(r.min_per_day);
      const mag = Number(r.bonus_points);
      if (!Number.isInteger(min) || min < 2) { setErr(`Min-per-day for "${k}" must be an integer ≥2.`); return; }
      if (!Number.isFinite(mag)) { setErr(`Bonus value for "${k}" must be a number.`); return; }
      const signed = r.mode === 'reward' ? Math.abs(mag) : -Math.abs(mag);
      if (!(k in scoringMap)) { setErr(`Rule references kind "${k}" but it isn't in scoring above.`); return; }
      bonusRules.push({ kind: k, min_per_day: min, bonus_points: signed });
    }

    setBusy(true);
    try {
      const res = await onSubmit({ name, starts_at: startsAt, ends_at: endsAt, scoring: scoringMap, bonus_rules: bonusRules });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.push(successHref(res.competition.id));
    } catch {
      // A network drop or non-JSON 500 inside onSubmit would otherwise escape
      // past the finally as an unhandled rejection with no error shown.
      setErr('Something went wrong saving. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {err && (
        <div className="rounded-lg border p-3 text-[12px]" style={{ borderColor: 'var(--red)', background: 'var(--red-soft)', color: 'var(--red)' }}>
          {err}
        </div>
      )}

      {/* Identity + dates */}
      <section className="rounded-2xl border p-6 grid gap-4 md:grid-cols-3" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <Field label="Name" hint="What athletes will see.">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-md border text-[13px]" style={{ borderColor: 'var(--border)' }} />
        </Field>
        <Field label="Starts" hint="Inclusive.">
          <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full px-3 py-2 rounded-md border text-[13px] mono" style={{ borderColor: 'var(--border)' }} />
        </Field>
        <Field label="Ends" hint="Inclusive.">
          <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full px-3 py-2 rounded-md border text-[13px] mono" style={{ borderColor: 'var(--border)' }} />
        </Field>
      </section>

      {/* Scoring */}
      <section className="rounded-2xl border p-6" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <header className="mb-3">
          <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Scoring</h2>
          <p className="text-[12px] text-[color:var(--ink-mute)]">
            One row per activity your athletes can log. Kind is a lowercase tag (e.g. <span className="mono">swim</span>, <span className="mono">workout</span>, <span className="mono">rehab</span>). Points can be any number, including fractions.
          </p>
        </header>
        <div className="space-y-2">
          {scoring.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_120px_36px] gap-2 items-center">
              <input type="text" value={row.kind} placeholder="swim" onChange={(e) => setScoring((s) => s.map((r) => r.id === row.id ? { ...r, kind: e.target.value } : r))} className="px-3 py-2 rounded-md border text-[13px] mono" style={{ borderColor: 'var(--border)' }} />
              <input type="text" value={row.points} placeholder="2" onChange={(e) => setScoring((s) => s.map((r) => r.id === row.id ? { ...r, points: e.target.value } : r))} className="px-3 py-2 rounded-md border text-[13px] tabular text-right" style={{ borderColor: 'var(--border)' }} />
              <button type="button" onClick={() => setScoring((s) => s.filter((r) => r.id !== row.id))} className="grid place-items-center size-9 rounded-md border hover:bg-[color:var(--red-soft)] transition" style={{ borderColor: 'var(--border)', color: 'var(--red)' }}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setScoring((s) => [...s, { id: nextId(s), kind: '', points: '1' }])} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition">
          <Plus className="size-4" /> Add kind
        </button>
      </section>

      {/* Bonus rules */}
      <section className="rounded-2xl border p-6" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <header className="mb-3">
          <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Stacking rules <span className="text-[11px] text-[color:var(--ink-mute)] font-normal">(optional)</span></h2>
          <p className="text-[12px] text-[color:var(--ink-mute)] max-w-[60ch]">
            Adjust points when athletes log the same kind multiple times in one day. <strong>Reward</strong> stacking encourages more in a day; <strong>penalize</strong> encourages spreading sessions across days. Each rule fires once per qualifying day per athlete.
          </p>
        </header>
        <div className="space-y-2">
          {bonus.map((row) => (
            <div key={row.id} className="grid grid-cols-[120px_60px_140px_140px_36px] gap-2 items-center">
              <input type="text" value={row.kind} placeholder="swim" onChange={(e) => setBonus((s) => s.map((r) => r.id === row.id ? { ...r, kind: e.target.value } : r))} className="px-3 py-2 rounded-md border text-[13px] mono" style={{ borderColor: 'var(--border)' }} />
              <input type="number" min={2} step={1} value={row.min_per_day} onChange={(e) => setBonus((s) => s.map((r) => r.id === row.id ? { ...r, min_per_day: e.target.value } : r))} className="px-3 py-2 rounded-md border text-[13px] tabular text-right" style={{ borderColor: 'var(--border)' }} />
              <select value={row.mode} onChange={(e) => setBonus((s) => s.map((r) => r.id === row.id ? { ...r, mode: e.target.value as 'reward' | 'penalize' } : r))} className="px-3 py-2 rounded-md border text-[13px]" style={{ borderColor: 'var(--border)' }}>
                <option value="reward">Reward by</option>
                <option value="penalize">Penalize by</option>
              </select>
              <input type="text" value={row.bonus_points} placeholder="1" onChange={(e) => setBonus((s) => s.map((r) => r.id === row.id ? { ...r, bonus_points: e.target.value } : r))} className="px-3 py-2 rounded-md border text-[13px] tabular text-right" style={{ borderColor: 'var(--border)' }} />
              <button type="button" onClick={() => setBonus((s) => s.filter((r) => r.id !== row.id))} className="grid place-items-center size-9 rounded-md border hover:bg-[color:var(--red-soft)] transition" style={{ borderColor: 'var(--border)', color: 'var(--red)' }}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setBonus((s) => [...s, { id: nextId(s), kind: '', min_per_day: '2', bonus_points: '1', mode: 'reward' }])} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition">
          <Plus className="size-4" /> Add rule
        </button>
        {bonus.length > 0 && (
          <div className="mt-4 pt-3 border-t text-[11.5px] text-[color:var(--ink-mute)]" style={{ borderColor: 'var(--border)' }}>
            <div className="font-semibold uppercase tracking-wide mb-1 text-[10.5px]">Preview</div>
            {bonus.map((r) => {
              const k = r.kind.trim().toLowerCase();
              const min = Number(r.min_per_day);
              const mag = Number(r.bonus_points);
              if (!k || !Number.isInteger(min) || !Number.isFinite(mag)) return null;
              const signed = r.mode === 'reward' ? Math.abs(mag) : -Math.abs(mag);
              const baseEntry = scoring.find((s) => s.kind.trim().toLowerCase() === k);
              const base = baseEntry ? Number(baseEntry.points) : null;
              const example = base != null ? min * base + signed : null;
              return (
                <div key={r.id} className="mono">
                  {min}+ <strong>{k}</strong>/day → {signed >= 0 ? `+${signed}` : signed} pts
                  {example != null && (
                    <span className="text-[color:var(--ink-dim)]"> (e.g. {min} × {base} {signed >= 0 ? '+' : '−'} {Math.abs(signed)} = {example} pts)</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Submit */}
      <section className="flex items-center justify-end gap-3">
        <Link href={cancelHref} className="text-[13px] font-semibold text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] transition">
          Cancel
        </Link>
        <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-60" style={{ background: 'var(--blue)' }}>
          {busy ? submitLabel.busy : submitLabel.idle}
        </button>
      </section>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-[color:var(--ink-mute)]">{hint}</p>}
    </div>
  );
}
