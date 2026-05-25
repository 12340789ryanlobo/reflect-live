'use client';

// /dashboard/competitions/new — coach create form. Thin shell over
// CompetitionForm; the form owns its own state.

import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { CompetitionForm } from '@/components/competitions/competition-form';

export default function NewCompetitionPage() {
  const { team, role } = useDashboard();
  const canCreate = role === 'coach' || role === 'admin';

  if (!canCreate) {
    return (
      <main className="px-8 py-12 text-[13px] text-[color:var(--ink-mute)]">
        Only coaches and platform admins can create competitions.{' '}
        <Link href="/dashboard/competitions" className="text-[color:var(--blue)] hover:underline">Back</Link>.
      </main>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Team · Competitions" title="New competition" subtitle={team?.name ?? ''} />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8 max-w-[920px]">
        <CompetitionForm
          mode="create"
          cancelHref="/dashboard/competitions"
          successHref={(id) => `/dashboard/competitions/${id}`}
          submitLabel={{ idle: 'Create competition', busy: 'Creating…' }}
          onSubmit={async (payload) => {
            if (!team?.id) return { ok: false, error: 'no_active_team' };
            const r = await fetch('/api/competitions', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ team_id: team.id, ...payload }),
            });
            const j = await r.json();
            if (!r.ok) return { ok: false, error: j.detail ?? j.error ?? 'create_failed' };
            return { ok: true, competition: j.competition };
          }}
        />
      </main>
    </>
  );
}
