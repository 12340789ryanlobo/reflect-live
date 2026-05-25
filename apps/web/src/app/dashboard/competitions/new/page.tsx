'use client';

// /dashboard/competitions/new — coach create form.
// Two columns of inputs, no wizard, all visible at once so a coach
// can scan the whole config before saving. Scoring + bonus rules are
// editable rows you add/remove inline.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Trash2, Plus } from 'lucide-react';

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

export default function NewCompetitionPage() {
  const { team, role } = useDashboard();
  const router = useRouter();

  const canCreate = role === 'coach' || role === 'admin';

  const [name, setName] = useState('Summer 2026');
  const [startsAt, setStartsAt] = useState('2026-06-01');
  const [endsAt, setEndsAt] = useState('2026-09-20');
  const [scoring, setScoring] = useState<ScoringRow[]>([
    { id: 1, kind: 'swim',    points: '2' },
    { id: 2, kind: 'workout', points: '1' },
    { id: 3, kind: 'rehab',   points: '0.6' },
  ]);
  const [bonus, setBonus] = useState<BonusRow[]>([
    { id: 1, kind: 'swim', min_per_day: '2', bonus_points: '1', mode: 'penalize' },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!canCreate) {
    return (
      <main className="px-8 py-12 text-[13px] text-[color:var(--ink-mute)]">
        Only coaches and platform admins can create competitions. <Link href="/dashboard/competitions" className="text-[color:var(--blue)] hover:underline">Back</Link>.
      </main>
    );
  }

  async function submit() {
    setErr(null);
    if (!team?.id) { setErr('no_active_team'); return; }

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

    // Build bonus rules.
    const bonusRules: Array<{ kind: string; min_per_day: number; bonus_points: number }> = [];
    for (const r of bonus) {
      const k = r.kind.trim().toLowerCase();
      if (!k) continue;
      const min = Number(r.min_per_day);
      const mag = Number(r.bonus_points);
      if (!Number.isInteger(min) || min < 2) { setErr(`Min-per-day for "${k}" must be an integer ≥2.`); return; }
      if (!Number.isFinite(mag)) { setErr(`Bonus value for "${k}" must be a number.`); return; }
      // mode determines sign; coach picks "reward" or "penalize",
      // the magnitude is always entered as a positive number for UX.
      const signed = r.mode === 'reward' ? Math.abs(mag) : -Math.abs(mag);
      if (!(k in scoringMap)) { setErr(`Rule references kind "${k}" but it isn't in scoring above.`); return; }
      bonusRules.push({ kind: k, min_per_day: min, bonus_points: signed });
    }

    setBusy(true);
    try {
      const r = await fetch('/api/competitions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          team_id: team.id,
          name,
          starts_at: startsAt,
          ends_at: endsAt,
          scoring: scoringMap,
          bonus_rules: bonusRules,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.detail ?? j.error ?? 'create_failed');
        return;
      }
      router.push(`/dashboard/competitions/${j.competition.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Team · Competitions"
        title="New competition"
        subtitle={`${team?.name ?? ''}`}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8 max-w-[920px]">
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
          <Link href="/dashboard/competitions" className="text-[13px] font-semibold text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] transition">
            Cancel
          </Link>
          <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-60" style={{ background: 'var(--blue)' }}>
            {busy ? 'Creating…' : 'Create competition'}
          </button>
        </section>
      </main>
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
