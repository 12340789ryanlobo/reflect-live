'use client';

// Coach-facing 'Manage groups' dialog. Lists every group on the team
// with its member count. Per row: rename inline (bulk rename), or
// delete (untag everyone — sets players.group = null).
//
// Backed by PATCH /api/teams/:id/groups which is a bulk operation.

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
import { Pencil, Trash2, Check, X } from 'lucide-react';

export interface GroupCount {
  name: string;
  count: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number;
  groups: GroupCount[];
  /** Called after any successful bulk rename / delete so the page can
   *  re-fetch the roster and refresh group counts. */
  onSaved: () => void;
}

export function ManageGroupsDialog({ open, onOpenChange, teamId, groups, onSaved }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setEditValue('');
      setErr(null);
    }
  }, [open]);

  function startEdit(name: string) {
    setEditing(name);
    setEditValue(name);
    setErr(null);
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue('');
  }

  async function commitRename(from: string) {
    const to = editValue.trim();
    if (!to) return;
    if (to === from) { cancelEdit(); return; }
    setBusy(from);
    setErr(null);
    const res = await fetch(`/api/teams/${teamId}/groups`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.detail ?? j.error ?? `Rename failed (${res.status}).`);
      return;
    }
    cancelEdit();
    onSaved();
  }

  async function deleteGroup(g: GroupCount) {
    const ok = confirm(
      `Delete group "${g.name}"? ${g.count} athlete${g.count === 1 ? '' : 's'} will be ungrouped.`,
    );
    if (!ok) return;
    setBusy(g.name);
    setErr(null);
    const res = await fetch(`/api/teams/${teamId}/groups`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: g.name, to: null }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.detail ?? j.error ?? `Delete failed (${res.status}).`);
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage groups</DialogTitle>
          <DialogDescription>
            Rename or delete groups for this team. Renames apply to every
            athlete currently in the group; delete sets everyone in the
            group back to &ldquo;no group&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {groups.length === 0 ? (
            <p className="text-[13px] text-[color:var(--ink-mute)] py-4 text-center">
              No groups yet. Add one by editing an athlete and choosing
              &ldquo;+ New group&hellip;&rdquo;.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {groups.map((g) => {
                const isEditing = editing === g.name;
                const isBusy = busy === g.name;
                return (
                  <li
                    key={g.name}
                    className="flex items-center justify-between gap-2 py-2.5"
                  >
                    {isEditing ? (
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(g.name);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="h-8 flex-1 text-[13px]"
                        disabled={isBusy}
                      />
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-semibold text-[color:var(--ink)] truncate">
                          {g.name}
                        </span>
                        <span className="text-[11.5px] text-[color:var(--ink-mute)] tabular shrink-0">
                          {g.count} athlete{g.count === 1 ? '' : 's'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => commitRename(g.name)}
                            disabled={isBusy || !editValue.trim()}
                            aria-label="Save rename"
                            className="rounded-md p-1 text-[color:var(--ink-mute)] hover:text-[color:var(--blue)] disabled:opacity-50"
                          >
                            <Check className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={isBusy}
                            aria-label="Cancel"
                            className="rounded-md p-1 text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] disabled:opacity-50"
                          >
                            <X className="size-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(g.name)}
                            disabled={isBusy}
                            aria-label={`Rename ${g.name}`}
                            className="rounded-md p-1 text-[color:var(--ink-mute)] hover:text-[color:var(--blue)] disabled:opacity-50"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteGroup(g)}
                            disabled={isBusy}
                            aria-label={`Delete ${g.name}`}
                            className="rounded-md p-1 text-[color:var(--ink-mute)] hover:text-[color:var(--red)] disabled:opacity-50"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {err && (
            <p className="mt-3 text-[12px]" style={{ color: 'var(--red)' }}>
              {err}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
