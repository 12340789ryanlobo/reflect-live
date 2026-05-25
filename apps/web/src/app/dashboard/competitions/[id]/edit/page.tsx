'use client';

// /dashboard/competitions/[id]/edit — coach editor. Loads the
// existing competition, pre-fills the shared form, PATCHes on save.

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { CompetitionForm } from '@/components/competitions/competition-form';
import type { Competition } from '@reflect-live/shared';

export default function EditCompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = Number(idStr);
  const { role } = useDashboard();
  const canEdit = role === 'coach' || role === 'admin';

  const [comp, setComp] = useState<Competition | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await fetch(`/api/competitions/${id}`, { cache: 'no-store' });
      if (!alive) return;
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? 'load_failed');
        setLoaded(true);
        return;
      }
      const j = await r.json();
      setComp(j.competition);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [id]);

  if (!canEdit) {
    return (
      <main className="px-8 py-12 text-[13px] text-[color:var(--ink-mute)]">
        Only coaches and platform admins can edit competitions.{' '}
        <Link href={`/dashboard/competitions/${id}`} className="text-[color:var(--blue)] hover:underline">Back</Link>.
      </main>
    );
  }
  if (!loaded) {
    return <main className="px-8 py-12 text-[13px] text-[color:var(--ink-mute)]">loading…</main>;
  }
  if (!comp) {
    return (
      <main className="px-8 py-12 text-[13px] text-[color:var(--ink-mute)]">
        {err ?? 'Competition not found.'}{' '}
        <Link href="/dashboard/competitions" className="text-[color:var(--blue)] hover:underline">Back to list</Link>.
      </main>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Competitions · Edit" title={comp.name} subtitle={`${comp.starts_at} → ${comp.ends_at}`} />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8 max-w-[920px]">
        <CompetitionForm
          mode="edit"
          initial={comp}
          cancelHref={`/dashboard/competitions/${id}`}
          successHref={(cid) => `/dashboard/competitions/${cid}`}
          submitLabel={{ idle: 'Save changes', busy: 'Saving…' }}
          onSubmit={async (payload) => {
            const r = await fetch(`/api/competitions/${id}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const j = await r.json();
            if (!r.ok) return { ok: false, error: j.detail ?? j.error ?? 'update_failed' };
            return { ok: true, competition: j.competition };
          }}
        />
      </main>
    </>
  );
}
