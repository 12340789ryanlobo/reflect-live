'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { Pill } from '@/components/v3/pill';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { prettyDate } from '@/lib/format';
import type { TeamCreationStatus } from '@reflect-live/shared';

interface TeamRow {
  id: number;
  name: string;
  code: string;
  team_code: string | null;
  description: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  creation_status: TeamCreationStatus;
  default_gender: string | null;
  created_at: string;
  member_count?: number;
}

const STATUS_TONE: Record<TeamCreationStatus, 'green' | 'amber' | 'red'> = {
  active: 'green',
  pending: 'amber',
  suspended: 'red',
};

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [requireApproval, setRequireApproval] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null);

  async function load() {
    setLoading(true);
    const [teamsRes, settingsRes] = await Promise.all([
      fetch('/api/teams'),
      fetch('/api/platform-settings'),
    ]);
    if (teamsRes.ok) {
      const j = await teamsRes.json();
      const list = (j.teams ?? []) as TeamRow[];

      // Pull pending request counts in one extra fetch per-team. Trivial
      // scale for an admin page; real active member counts can ship later
      // as a separate endpoint.
      const counts = await Promise.all(
        list.map(async (t) => {
          const r = await fetch(`/api/teams/${t.id}/requests`);
          let pending = 0;
          if (r.ok) {
            const rj = await r.json();
            pending = (rj.requests ?? []).length;
          }
          return { id: t.id, member_count: pending };
        }),
      );
      const byId = new Map(counts.map((c) => [c.id, c.member_count]));
      setTeams(list.map((t) => ({ ...t, member_count: byId.get(t.id) ?? 0 })));
    }
    if (settingsRes.ok) {
      const sj = await settingsRes.json();
      setRequireApproval(sj.settings?.require_team_approval === true);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setApproval(next: boolean) {
    setRequireApproval(next);
    await fetch('/api/platform-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ require_team_approval: next }),
    });
  }

  async function lifecycle(team: TeamRow, action: 'freeze' | 'unfreeze' | 'approve') {
    setBusyId(team.id);
    const res = await fetch(`/api/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (res.ok) await load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const res = await fetch(`/api/teams/${deleteTarget.id}`, { method: 'DELETE' });
    setBusyId(null);
    setDeleteTarget(null);
    if (res.ok) await load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Teams"
        subtitle={loading ? '— loading —' : `${teams.length} teams registered`}
      />
      <main className="px-6 py-4 space-y-6">
        <section
          className="rounded-2xl bg-[color:var(--card)] border p-5 flex items-center justify-between gap-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <p className="text-[13.5px] font-semibold text-[color:var(--ink)]">Require admin approval for new teams</p>
            <p className="text-[12px] text-[color:var(--ink-mute)]">
              When on, coaches who create a team via the self-service form land in pending
              until you approve. Off by default — most teams should self-serve.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setApproval(e.target.checked)}
              className="size-4"
            />
            {requireApproval ? 'On' : 'Off'}
          </label>
        </section>

        <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header
            className="flex items-center justify-between gap-3 px-6 py-4 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2 className="text-base font-bold text-[color:var(--ink)]">All teams</h2>
            <span className="text-[11.5px] text-[color:var(--ink-mute)]">{teams.length}</span>
          </header>
          {loading ? (
            <p className="px-6 py-10 text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
          ) : teams.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-[color:var(--ink-mute)]">
              No teams yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {teams.map((t) => (
                <li key={t.id} className="px-6 py-3.5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-[color:var(--ink)]">{t.name}</span>
                      <Pill tone={STATUS_TONE[t.creation_status]}>{t.creation_status}</Pill>
                      {t.team_code && (
                        <span className="text-[11.5px] text-[color:var(--ink-mute)] mono">
                          code: <span className="font-semibold">{t.team_code}</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-[color:var(--ink-mute)]">
                      {t.description ?? <span className="italic">no description</span>}
                    </p>
                    <p className="mt-1 mono text-[11px] text-[color:var(--ink-mute)] tabular">
                      created {prettyDate(t.created_at)}
                      {(t.member_count ?? 0) > 0 && <> · {t.member_count} pending request{t.member_count === 1 ? '' : 's'}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.creation_status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => lifecycle(t, 'approve')}
                        disabled={busyId === t.id}
                      >
                        Approve
                      </Button>
                    )}
                    {t.creation_status === 'active' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => lifecycle(t, 'freeze')}
                        disabled={busyId === t.id}
                        className="text-[color:var(--ink-mute)] hover:text-[color:var(--amber)]"
                      >
                        Freeze
                      </Button>
                    )}
                    {t.creation_status === 'suspended' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => lifecycle(t, 'unfreeze')}
                        disabled={busyId === t.id}
                      >
                        Unfreeze
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(t)}
                      disabled={busyId === t.id}
                      className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)]"
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This is permanent. Memberships, sessions, and other rows referencing
              this team will block the delete unless you remove them first. Use
              Freeze if you just want to hide the team.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={busyId === deleteTarget?.id}>
              {busyId === deleteTarget?.id ? 'Deleting…' : 'Delete team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
