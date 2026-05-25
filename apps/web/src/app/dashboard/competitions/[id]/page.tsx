'use client';

// /dashboard/competitions/[id] — detail + leaderboard.
//
// Athletes see: rank, points, base+bonus split.
// Coaches see: same, plus inline edit affordances for name / dates /
// scoring / bonus rules, and an Archive button.

import { useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import type { Competition } from '@reflect-live/shared';
import { Archive, ChevronLeft, Pencil } from 'lucide-react';

// Top-3 medal glyphs. We use real emoji rather than icon components
// because they read as 'competition' across every render context
// (Slack screenshots, mobile share previews, etc) — same call the
// legacy reflect leaderboard made.
const MEDALS = ['🥇', '🥈', '🥉'] as const;

/** Inclusive day-difference between two YYYY-MM-DD strings. */
function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO + 'T00:00:00Z').getTime();
  const b = new Date(bISO + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86_400_000);
}

interface LeaderboardRow {
  player_id: number;
  name: string;
  group: string | null;
  counts: Record<string, number>;
  base_points: number;
  bonus_total: number;
  points: number;
}

export default function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = Number(idStr);
  const { role } = useDashboard();
  const canEdit = role === 'coach' || role === 'admin';

  const [comp, setComp] = useState<Competition | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  async function reload() {
    setLoaded(false);
    const r = await fetch(`/api/competitions/${id}`, { cache: 'no-store' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? 'load_failed');
      setLoaded(true);
      return;
    }
    const j = await r.json();
    setComp(j.competition);
    setRows(j.leaderboard ?? []);
    setLoaded(true);
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function toggleArchive() {
    if (!comp) return;
    setArchiveBusy(true);
    try {
      const r = await fetch(`/api/competitions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: comp.archived_at ? null : true }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.detail ?? j.error ?? 'patch_failed');
        return;
      }
      await reload();
    } finally {
      setArchiveBusy(false);
    }
  }

  const scoringEntries = useMemo(() => Object.entries(comp?.scoring ?? {}), [comp]);

  if (!loaded) {
    return <main className="px-8 py-12 text-[13px] text-[color:var(--ink-mute)]">loading…</main>;
  }
  if (!comp) {
    return (
      <main className="px-8 py-12 text-[13px] text-[color:var(--ink-mute)]">
        {err ?? 'Competition not found.'} <Link href="/dashboard/competitions" className="text-[color:var(--blue)] hover:underline">Back to list</Link>.
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const isLive = !comp.archived_at && comp.starts_at <= today && today <= comp.ends_at;
  const isUpcoming = !comp.archived_at && comp.starts_at > today;
  const isEnded = !comp.archived_at && comp.ends_at < today;
  const statusLabel = comp.archived_at
    ? 'Archived'
    : isLive ? 'Live now' : isUpcoming ? 'Upcoming' : isEnded ? 'Ended' : '—';
  const statusTone = comp.archived_at ? 'var(--ink-dim)' : isLive ? 'var(--green)' : isUpcoming ? 'var(--amber)' : 'var(--ink-mute)';

  // Days remaining / until start. Inclusive of today.
  const daysLeft = isLive ? daysBetween(today, comp.ends_at) + 1 : null;
  const daysUntil = isUpcoming ? daysBetween(today, comp.starts_at) : null;

  // Progress through the competition window for the hero strip.
  const totalDays = daysBetween(comp.starts_at, comp.ends_at) + 1;
  const elapsedDays = isLive
    ? daysBetween(comp.starts_at, today) + 1
    : isEnded ? totalDays : 0;
  const progressPct = Math.max(0, Math.min(100, (elapsedDays / totalDays) * 100));

  const leader = rows[0] ?? null;

  return (
    <>
      <PageHeader eyebrow="Competitions" title={comp.name} subtitle={`${comp.starts_at} → ${comp.ends_at} · ${statusLabel}`} />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard/competitions" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] transition">
            <ChevronLeft className="size-4" /> All competitions
          </Link>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/competitions/${id}/edit`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white transition hover:opacity-90"
                style={{ background: 'var(--blue)' }}
              >
                <Pencil className="size-3.5" />
                Edit
              </Link>
              <button
                type="button"
                onClick={toggleArchive}
                disabled={archiveBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-semibold transition hover:bg-[color:var(--paper-2)] disabled:opacity-60"
                style={{ borderColor: 'var(--border-2)', color: 'var(--ink-soft)' }}
              >
                <Archive className="size-3.5" />
                {comp.archived_at ? 'Unarchive' : 'Archive'}
              </button>
            </div>
          )}
        </div>

        {err && (
          <div className="rounded-lg border p-3 text-[12px]" style={{ borderColor: 'var(--red)', background: 'var(--red-soft)', color: 'var(--red)' }}>
            {err}
          </div>
        )}

        {/* Competition hero — gives the page the 'this is an event'
            feel rather than 'this is a config page'. Status pulse +
            days countdown + leader callout + a thin progress strip
            that fills as the window elapses. */}
        <section
          className="reveal rounded-2xl border overflow-hidden"
          style={{ borderColor: 'var(--border)', background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-2) 100%)' }}
        >
          <div className="px-6 py-6 md:px-8 md:py-8 grid gap-6 md:grid-cols-[1fr_auto] md:items-end text-white">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider opacity-90">
                {isLive && <span className="inline-block size-1.5 rounded-full bg-white animate-pulse" />}
                {statusLabel}
              </div>
              <h2 className="mt-1 text-2xl md:text-3xl font-bold tracking-[-0.01em]">{comp.name}</h2>
              <p className="mt-1 text-[13px] mono opacity-85">
                {comp.starts_at} → {comp.ends_at}
                {daysLeft != null && (
                  <span className="ml-3 inline-flex items-center gap-1 font-semibold opacity-100">
                    · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                  </span>
                )}
                {daysUntil != null && daysUntil > 0 && (
                  <span className="ml-3 font-semibold">· starts in {daysUntil} day{daysUntil === 1 ? '' : 's'}</span>
                )}
              </p>
            </div>
            {leader && (
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Current leader</div>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span className="text-2xl">🥇</span>
                  <span className="text-xl font-bold">{leader.name}</span>
                </div>
                <div className="mt-0.5 tabular text-[13px] opacity-90 font-semibold">{leader.points} pts</div>
              </div>
            )}
          </div>
          {/* Progress strip */}
          <div className="h-1.5 bg-white/20">
            <div className="h-full bg-white/90 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </section>

        {/* Rules summary */}
        <section className="rounded-2xl border p-6 grid gap-4 md:grid-cols-2" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] mb-2">Scoring</h2>
            {scoringEntries.length === 0 ? (
              <div className="text-[13px] text-[color:var(--ink-dim)]">No scoring kinds configured.</div>
            ) : (
              <ul className="space-y-1.5">
                {scoringEntries.map(([k, v]) => (
                  <li key={k} className="flex items-baseline justify-between text-[13px]">
                    <span className="mono text-[color:var(--ink)]">{k}</span>
                    <span className="tabular font-semibold" style={{ color: 'var(--blue)' }}>{v} pt{Math.abs(v) === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] mb-2">Stacking rules</h2>
            {comp.bonus_rules.length === 0 ? (
              <div className="text-[13px] text-[color:var(--ink-dim)]">No stacking adjustments.</div>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {comp.bonus_rules.map((r, i) => (
                  <li key={i} className="mono text-[color:var(--ink)]">
                    {r.min_per_day}+ <strong>{r.kind}</strong>/day →{' '}
                    <span style={{ color: r.bonus_points >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {r.bonus_points >= 0 ? `+${r.bonus_points}` : r.bonus_points} pts
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="md:col-span-2" style={{ borderTop: '1px dashed var(--border)' }}>
            <p className="mt-3 text-[11.5px] text-[color:var(--ink-mute)]">
              Stacking rules apply once per athlete per day when the threshold is met. Multiple rules on the same kind compose additively.
            </p>
          </div>
        </section>

        {/* Leaderboard */}
        <section className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Leaderboard</h2>
            <span className="text-[10.5px] uppercase tracking-wide font-semibold" style={{ color: statusTone }}>{statusLabel}</span>
          </header>
          {rows.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
              No scored activity in the window yet.
            </div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] w-12">#</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Athlete</th>
                  {scoringEntries.map(([k]) => (
                    <th key={k} className="px-3 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] mono">{k}</th>
                  ))}
                  <th className="px-3 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Bonus</th>
                  <th className="px-4 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Points</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const medal = i < 3 ? MEDALS[i] : null;
                  return (
                  <tr
                    key={r.player_id}
                    className="border-b last:border-b-0 transition"
                    style={{
                      borderColor: 'var(--border)',
                      background: i === 0 ? 'color-mix(in srgb, var(--blue) 4%, transparent)' : undefined,
                    }}
                  >
                    <td className="px-4 py-2.5 tabular mono">
                      {medal ? (
                        <span className="text-[18px] leading-none">{medal}</span>
                      ) : (
                        <span className="text-[color:var(--ink-mute)]">{i + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[color:var(--ink)]">
                      <Link
                        href={`/dashboard/players/${r.player_id}`}
                        className="hover:text-[color:var(--blue)] transition"
                        style={{ fontWeight: i < 3 ? 700 : 500 }}
                      >
                        {r.name}
                      </Link>
                      {r.group && <span className="ml-2 text-[10px] uppercase tracking-wide text-[color:var(--ink-mute)]">{r.group}</span>}
                    </td>
                    {scoringEntries.map(([k]) => (
                      <td key={k} className="px-3 py-2.5 text-right mono tabular text-[color:var(--ink-soft)]">
                        {r.counts[k] ?? 0}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right mono tabular" style={{ color: r.bonus_total === 0 ? 'var(--ink-dim)' : r.bonus_total > 0 ? 'var(--green)' : 'var(--red)' }}>
                      {r.bonus_total === 0 ? '—' : r.bonus_total > 0 ? `+${r.bonus_total}` : r.bonus_total}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className="inline-flex items-center justify-center tabular font-bold rounded-full px-2.5 py-0.5"
                        style={{
                          minWidth: 36,
                          background: i < 3 ? 'var(--blue-soft)' : 'transparent',
                          color: i < 3 ? 'var(--blue)' : 'var(--ink)',
                        }}
                      >
                        {r.points}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
