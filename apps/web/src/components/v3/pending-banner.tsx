'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/format';
import type { TeamMembership } from '@reflect-live/shared';
import { Clock } from 'lucide-react';

interface Props {
  pending: TeamMembership[];
  teamNames: Record<number, string>;
  onAfterCancel: () => Promise<void> | void;
}

export function PendingBanner({ pending, teamNames, onAfterCancel }: Props) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  if (pending.length === 0) return null;

  async function cancel(teamId: number) {
    setCancellingId(teamId);
    const res = await fetch(`/api/team-memberships/${teamId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    setCancellingId(null);
    if (res.ok) await onAfterCancel();
  }

  return (
    <div
      className="border-b bg-[color:var(--amber-soft)] px-6 py-3"
      style={{ borderColor: 'var(--border)' }}
      role="status"
      aria-live="polite"
    >
      <ul className="space-y-1.5">
        {pending.map((p) => {
          const teamName = teamNames[p.team_id] ?? `team ${p.team_id}`;
          return (
            <li key={p.team_id} className="flex items-center gap-3 text-[13px] text-[color:var(--ink)]">
              <Clock className="size-4 text-[color:var(--amber)]" aria-hidden />
              <span className="flex-1 min-w-0">
                Request to <span className="font-semibold">{teamName}</span> is pending
                <span className="ml-2 text-[11.5px] text-[color:var(--ink-mute)]">
                  · sent {relativeTime(p.requested_at)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancel(p.team_id)}
                disabled={cancellingId === p.team_id}
                className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)]"
              >
                {cancellingId === p.team_id ? 'Cancelling…' : 'Cancel request'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
