'use client';

// Danger Zone — bottom of /dashboard/settings. Three self-service
// destructive actions:
//   1. Leave a single team (membership row → status=left, account
//      and other team memberships untouched).
//   2. Delete the team you're currently coaching (cascades all
//      child rows, cancels Stripe sub at period end).
//   3. Delete your own account (cascades memberships + prefs +
//      Clerk auth row).
//
// Each destructive button requires typing a confirmation string
// (team name or the literal phrase 'delete my account') to guard
// against muscle-memory clicks. After success we redirect: leaving
// the active team or deleting the account sends the user to '/'
// because their dashboard context is gone.

import { useEffect, useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useSupabase } from '@/lib/supabase-browser';
import type { TeamMembership } from '@reflect-live/shared';

type Mem = TeamMembership & { team_name?: string };

interface Props {
  activeTeamId: number | null;
  activeTeamName: string | null;
  /** True when the caller is an active 'coach' on the active team. */
  canDeleteActiveTeam: boolean;
}

export function DangerZone({ activeTeamId, activeTeamName, canDeleteActiveTeam }: Props) {
  const clerk = useClerk();
  const sb = useSupabase();
  const [mems, setMems] = useState<Mem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Local UI state for the three confirmation flows.
  const [leavingTeamId, setLeavingTeamId] = useState<number | null>(null);
  const [deletingTeamConfirm, setDeletingTeamConfirm] = useState('');
  const [deletingTeamBusy, setDeletingTeamBusy] = useState(false);
  const [deletingAccountConfirm, setDeletingAccountConfirm] = useState('');
  const [deletingAccountBusy, setDeletingAccountBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const memRes = await fetch('/api/team-memberships', { cache: 'no-store' });
        const memJson = memRes.ok ? await memRes.json() : { memberships: [] };
        const raw: TeamMembership[] = memJson.memberships ?? [];
        const active = raw.filter((m) => m.status === 'active');
        // Hydrate team names directly from the browser Supabase
        // client — RLS lets a user read teams they're a member of,
        // which is exactly the set we want.
        const ids = Array.from(new Set(active.map((m) => m.team_id)));
        const names: Record<number, string> = {};
        if (ids.length) {
          const { data: ts } = await sb.from('teams').select('id, name').in('id', ids);
          for (const t of ts ?? []) names[t.id as number] = t.name as string;
        }
        if (!alive) return;
        setMems(active.map((m) => ({ ...m, team_name: names[m.team_id] })));
        setLoaded(true);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [sb]);

  async function leaveTeam(teamId: number) {
    setErr(null);
    setLeavingTeamId(teamId);
    try {
      const r = await fetch(`/api/team-memberships/${teamId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'leave' }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? 'leave_failed');
        return;
      }
      // If we just left the team we were viewing, dashboard-shell will
      // re-heal on the next render; a full reload makes that
      // unambiguous.
      if (teamId === activeTeamId) window.location.assign('/dashboard');
      else setMems((prev) => prev.filter((m) => m.team_id !== teamId));
    } finally {
      setLeavingTeamId(null);
    }
  }

  async function deleteActiveTeam() {
    if (!activeTeamId || !activeTeamName) return;
    if (deletingTeamConfirm.trim() !== activeTeamName) {
      setErr('team_name_mismatch');
      return;
    }
    setErr(null);
    setDeletingTeamBusy(true);
    try {
      const r = await fetch(`/api/teams/${activeTeamId}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        // Surface the underlying Postgres error (j.detail) plus any
        // per-table cleanup failures (j.steps), so when an unknown
        // FK blocks the cascade we know which table to add to the
        // sweep. Falling back to j.error keeps the simpler messages
        // for the everyday cases.
        const detail = typeof j.detail === 'string' ? j.detail : null;
        const failedSteps = Array.isArray(j.steps)
          ? j.steps.filter((s: { error: string | null }) => s.error)
            .map((s: { name: string; error: string }) => `${s.name}: ${s.error}`)
            .join('; ')
          : null;
        const message =
          [j.error ?? 'team_delete_failed', detail, failedSteps]
            .filter(Boolean)
            .join(' — ');
        setErr(message);
        return;
      }
      window.location.assign('/dashboard');
    } finally {
      setDeletingTeamBusy(false);
    }
  }

  async function deleteMyAccount() {
    if (deletingAccountConfirm.trim().toLowerCase() !== 'delete my account') {
      setErr('confirm_mismatch');
      return;
    }
    setErr(null);
    setDeletingAccountBusy(true);
    try {
      const r = await fetch('/api/me', { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? 'account_delete_failed');
        setDeletingAccountBusy(false);
        return;
      }
      // Sign out client-side too — the Clerk row is gone, but the
      // browser still holds a session cookie until we explicitly
      // clear it. signOut redirects to '/'.
      await clerk.signOut({ redirectUrl: '/' });
    } catch (e) {
      setErr((e as Error).message);
      setDeletingAccountBusy(false);
    }
  }

  const otherMems = mems.filter((m) => m.team_id !== activeTeamId);
  const onActiveMem = mems.find((m) => m.team_id === activeTeamId);

  return (
    <section
      className="reveal rounded-2xl border p-6 md:p-8"
      style={{ borderColor: 'var(--red)', background: 'var(--card)' }}
    >
      <header className="mb-4">
        <h2
          className="text-base font-bold tracking-[-0.01em]"
          style={{ color: 'var(--red)' }}
        >
          Danger zone
        </h2>
        <p className="text-[12px] text-[color:var(--ink-mute)] mt-1">
          Destructive actions. None of these are recoverable from the app.
        </p>
      </header>

      {err && (
        <div
          className="mb-4 rounded-lg border p-3 text-[12px]"
          style={{ borderColor: 'var(--red)', background: 'var(--red-soft)', color: 'var(--red)' }}
        >
          {err === 'team_name_mismatch'
            ? `Type the team name exactly to confirm: ${activeTeamName}`
            : err === 'confirm_mismatch'
              ? 'Type "delete my account" to confirm.'
              : err}
        </div>
      )}

      <div className="space-y-6">
        {/* Leave other teams */}
        {loaded && otherMems.length > 0 && (
          <div>
            <h3 className="text-[13px] font-semibold text-[color:var(--ink)] mb-2">Leave another team</h3>
            <p className="text-[12px] text-[color:var(--ink-mute)] mb-3 max-w-[60ch]">
              Removes you from the team's roster. Your account and other memberships stay intact.
            </p>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {otherMems.map((m) => (
                <li key={m.team_id} className="flex items-center justify-between py-2">
                  <div className="text-[13px] text-[color:var(--ink)]">
                    {m.team_name ?? `Team ${m.team_id}`}
                    <span className="ml-2 text-[11px] text-[color:var(--ink-mute)] uppercase tracking-wide">{m.role}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => leaveTeam(m.team_id)}
                    disabled={leavingTeamId === m.team_id}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-md border transition hover:bg-[color:var(--red-soft)] disabled:opacity-60"
                    style={{ borderColor: 'var(--border-2)', color: 'var(--red)' }}
                  >
                    {leavingTeamId === m.team_id ? 'Leaving…' : 'Leave team'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Leave the currently active team (separate UI because losing
            it triggers a redirect; we want to be explicit). */}
        {loaded && onActiveMem && onActiveMem.role !== 'coach' && (
          <div>
            <h3 className="text-[13px] font-semibold text-[color:var(--ink)] mb-2">
              Leave {activeTeamName ?? 'this team'}
            </h3>
            <p className="text-[12px] text-[color:var(--ink-mute)] mb-3 max-w-[60ch]">
              You'll be redirected to the dashboard, which will pick a different team if you're on one.
            </p>
            <button
              type="button"
              onClick={() => leaveTeam(activeTeamId!)}
              disabled={leavingTeamId === activeTeamId}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-md border transition hover:bg-[color:var(--red-soft)] disabled:opacity-60"
              style={{ borderColor: 'var(--border-2)', color: 'var(--red)' }}
            >
              {leavingTeamId === activeTeamId ? 'Leaving…' : `Leave ${activeTeamName ?? 'team'}`}
            </button>
          </div>
        )}

        {/* Delete active team — coach only. */}
        {canDeleteActiveTeam && activeTeamId && activeTeamName && (
          <div>
            <h3 className="text-[13px] font-semibold text-[color:var(--ink)] mb-2">
              Delete {activeTeamName}
            </h3>
            <p className="text-[12px] text-[color:var(--ink-mute)] mb-3 max-w-[60ch]">
              Removes every athlete, message, session, and survey on this team. If the team has a
              paid Stripe subscription it's cancelled at the end of the billing cycle, no further
              charges. To confirm, type the team name below.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={deletingTeamConfirm}
                onChange={(e) => setDeletingTeamConfirm(e.target.value)}
                placeholder={activeTeamName}
                className="flex-1 max-w-[280px] px-3 py-1.5 rounded-md border text-[13px] mono"
                style={{ borderColor: 'var(--border)' }}
              />
              <button
                type="button"
                onClick={deleteActiveTeam}
                disabled={deletingTeamBusy || deletingTeamConfirm.trim() !== activeTeamName}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-md text-white transition disabled:opacity-50"
                style={{ background: 'var(--red)' }}
              >
                {deletingTeamBusy ? 'Deleting…' : 'Delete team'}
              </button>
            </div>
          </div>
        )}

        {/* Delete account — always available. */}
        <div className="pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-[13px] font-semibold text-[color:var(--ink)] mb-2">Delete my account</h3>
          <p className="text-[12px] text-[color:var(--ink-mute)] mb-3 max-w-[60ch]">
            Removes your account, all team memberships, phone-verification rows, and personal
            preferences. Player roster entries are preserved as team data. Type{' '}
            <span className="mono text-[11px] text-[color:var(--ink)]">delete my account</span> to confirm.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={deletingAccountConfirm}
              onChange={(e) => setDeletingAccountConfirm(e.target.value)}
              placeholder="delete my account"
              className="flex-1 max-w-[280px] px-3 py-1.5 rounded-md border text-[13px] mono"
              style={{ borderColor: 'var(--border)' }}
            />
            <button
              type="button"
              onClick={deleteMyAccount}
              disabled={
                deletingAccountBusy
                || deletingAccountConfirm.trim().toLowerCase() !== 'delete my account'
              }
              className="text-[12px] font-semibold px-3 py-1.5 rounded-md text-white transition disabled:opacity-50"
              style={{ background: 'var(--red)' }}
            >
              {deletingAccountBusy ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
