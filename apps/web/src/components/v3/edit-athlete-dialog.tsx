'use client';

// Coach-facing edit dialog for a single athlete. Lets the coach
// (or platform admin) change the athlete's group and toggle their
// captain status. Captain toggle is disabled when the athlete has
// no active team_membership row (no Clerk user yet) — server enforces
// the same check.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NEW_GROUP_SENTINEL = '__new__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: {
    id: number;
    name: string;
    group: string | null;
  };
  /** All groups currently in use on the team — populates the dropdown. */
  knownGroups: string[];
  /** True when the athlete has an active team_memberships row. Captain
   *  toggle is disabled (with an explanatory note) when false. */
  hasLinkedMembership: boolean;
  /** Current membership role — drives the captain toggle initial state. */
  membershipRole: 'captain' | 'athlete' | null;
  /** Called after a successful save so the parent can re-fetch. */
  onSaved: () => void;
}

export function EditAthleteDialog({
  open,
  onOpenChange,
  player,
  knownGroups,
  hasLinkedMembership,
  membershipRole,
  onSaved,
}: Props) {
  const [groupChoice, setGroupChoice] = useState<string>('');
  const [newGroupInput, setNewGroupInput] = useState<string>('');
  const [isCaptain, setIsCaptain] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset form whenever the dialog opens for a (potentially) different player.
  useEffect(() => {
    if (!open) return;
    const current = player.group ?? '';
    if (current && knownGroups.includes(current)) {
      setGroupChoice(current);
      setNewGroupInput('');
    } else if (current) {
      // Player has a group that isn't in the dropdown (race vs other coach
      // edits, or first time we're seeing it). Treat as new-group entry.
      setGroupChoice(NEW_GROUP_SENTINEL);
      setNewGroupInput(current);
    } else {
      setGroupChoice('');
      setNewGroupInput('');
    }
    setIsCaptain(membershipRole === 'captain');
    setErr(null);
  }, [open, player.id, player.group, knownGroups, membershipRole]);

  const resolvedGroup =
    groupChoice === NEW_GROUP_SENTINEL ? newGroupInput.trim() : groupChoice;

  const groupChanged = (player.group ?? '') !== resolvedGroup;
  const captainChanged = hasLinkedMembership && (membershipRole === 'captain') !== isCaptain;
  const dirty = groupChanged || captainChanged;

  async function save() {
    setSaving(true);
    setErr(null);
    const patch: Record<string, unknown> = {};
    if (groupChanged) patch.group = resolvedGroup === '' ? null : resolvedGroup;
    if (captainChanged) patch.membership_role = isCaptain ? 'captain' : 'athlete';

    const res = await fetch(`/api/players/${player.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.detail ?? j.error ?? `Save failed (${res.status}).`);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {player.name}</DialogTitle>
          <DialogDescription>
            Change this athlete&rsquo;s group or captain status. Other roster
            edits live on the admin Users page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
              Group
            </label>
            <Select value={groupChoice || 'none'} onValueChange={(v) => setGroupChoice(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="No group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No group</SelectItem>
                {knownGroups.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
                <SelectItem value={NEW_GROUP_SENTINEL}>+ New group…</SelectItem>
              </SelectContent>
            </Select>
            {groupChoice === NEW_GROUP_SENTINEL && (
              <Input
                autoFocus
                placeholder="e.g. distance, sprint, breast"
                value={newGroupInput}
                onChange={(e) => setNewGroupInput(e.target.value)}
                className="h-9"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
              Captain
            </label>
            <label
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                hasLinkedMembership ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              }`}
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-[13px] text-[color:var(--ink)]">
                Promote to captain
              </span>
              <input
                type="checkbox"
                checked={isCaptain}
                disabled={!hasLinkedMembership}
                onChange={(e) => setIsCaptain(e.target.checked)}
                className="size-4 accent-[color:var(--blue)]"
              />
            </label>
            {!hasLinkedMembership && (
              <p className="text-[11.5px] text-[color:var(--ink-mute)]">
                This athlete hasn&rsquo;t signed up via the join code yet.
                Captain promotion needs an active membership.
              </p>
            )}
          </div>

          {err && (
            <p className="text-[12px]" style={{ color: 'var(--red)' }}>
              {err}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
