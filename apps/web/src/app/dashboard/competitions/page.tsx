'use client';

// /dashboard/competitions — coach: list active + archived competitions
// for the current team with a "+ New" button. Athletes can read this
// page too but the create button is hidden for them.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import type { Competition } from '@reflect-live/shared';
import { Plus } from 'lucide-react';

type Tab = 'active' | 'archived';

function isActive(c: Competition, today: string): boolean {
  return !c.archived_at && c.starts_at <= today && today <= c.ends_at;
}
function isUpcoming(c: Competition, today: string): boolean {
  return !c.archived_at && c.starts_at > today;
}
function isPast(c: Competition, today: string): boolean {
  return !c.archived_at && c.ends_at < today;
}

export default function CompetitionsPage() {
  const { team, role } = useDashboard();
  const [items, setItems] = useState<Competition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('active');

  const canCreate = role === 'coach' || role === 'admin';
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!team?.id) return;
    let alive = true;
    (async () => {
      const r = await fetch(`/api/competitions?team_id=${team.id}`, { cache: 'no-store' });
      const j = r.ok ? await r.json() : { competitions: [] };
      if (!alive) return;
      setItems(j.competitions ?? []);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [team?.id]);

  const visible = items.filter((c) => (tab === 'active' ? !c.archived_at : c.archived_at));

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Competitions"
        subtitle={`${team?.name ?? ''} · configurable scoring`}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Tab strip + new button */}
        <section className="reveal reveal-1 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            {(['active', 'archived'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-[12px] font-semibold px-3 py-1.5 rounded transition"
                style={{
                  background: tab === t ? 'var(--paper-2)' : 'transparent',
                  color: tab === t ? 'var(--ink)' : 'var(--ink-mute)',
                }}
              >
                {t === 'active' ? 'Active & upcoming' : 'Archived'}
              </button>
            ))}
          </nav>
          {canCreate && (
            <Link
              href="/dashboard/competitions/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ background: 'var(--blue)' }}
            >
              <Plus className="size-4" />
              New competition
            </Link>
          )}
        </section>

        {/* List */}
        <section className="reveal reveal-2 rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          {!loaded && (
            <div className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">loading…</div>
          )}
          {loaded && visible.length === 0 && (
            <div className="px-6 py-12 text-center text-[13px] text-[color:var(--ink-mute)]">
              {tab === 'active'
                ? canCreate
                  ? <>No competitions yet. <Link href="/dashboard/competitions/new" className="text-[color:var(--blue)] hover:underline">Create one</Link>.</>
                  : <>Your coach hasn&apos;t set up a competition yet.</>
                : <>Nothing archived.</>}
            </div>
          )}
          {loaded && visible.length > 0 && (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-6 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Name</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Dates</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Status</th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Scoring</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const kinds = Object.entries(c.scoring);
                  const status = c.archived_at
                    ? { label: 'archived', tone: 'var(--ink-dim)' }
                    : isActive(c, today)
                      ? { label: 'live', tone: 'var(--green)' }
                      : isUpcoming(c, today)
                        ? { label: 'upcoming', tone: 'var(--amber)' }
                        : isPast(c, today)
                          ? { label: 'ended', tone: 'var(--ink-mute)' }
                          : { label: '—', tone: 'var(--ink-mute)' };
                  return (
                    <tr key={c.id} className="border-b last:border-b-0 hover:bg-[color:var(--card-hover)] transition" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-6 py-3">
                        <Link href={`/dashboard/competitions/${c.id}`} className="font-semibold text-[color:var(--ink)] hover:text-[color:var(--blue)] transition">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 mono tabular text-[12px] text-[color:var(--ink-soft)]">
                        {c.starts_at} → {c.ends_at}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: status.tone }}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[color:var(--ink-soft)]">
                        {kinds.length === 0
                          ? <span className="text-[color:var(--ink-dim)]">none set</span>
                          : kinds.map(([k, v]) => `${k}=${v}`).join(' · ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {!canCreate && (
          <p className="reveal reveal-3 text-[11.5px] text-[color:var(--ink-mute)] leading-relaxed">
            Read-only view. Only coaches and platform admins can create or edit competitions.
          </p>
        )}
      </main>
    </>
  );
}
