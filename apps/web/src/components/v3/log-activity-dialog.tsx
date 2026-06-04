'use client';

// Manual activity logging from the athlete page. Used by both athletes
// (self) and coaches (logging on behalf). Posts to POST /api/activity-logs.
// The kind options are fetched live from /api/teams/[id]/allowed-kinds —
// baseline {workout, rehab} plus whatever the active competition scores —
// so athletes can log anything the current competition rewards. Kind toggle
// defaults to whatever the action button asked for, falling back to the
// first allowed kind if that one isn't currently loggable.
//
// 'Notes for coach' is a free-form addendum that gets appended to the
// description server-side as a 'Notes for coach: …' paragraph. We only
// surface the field when an athlete is logging for themselves —
// coaches logging on behalf wouldn't be writing notes to themselves.

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

type Kind = string;

const FALLBACK_KINDS = ['workout', 'rehab'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Team whose active competitions decide which kinds are loggable. */
  teamId: number;
  playerId: number;
  playerName: string;
  /** True when the viewer is the athlete themselves — surfaces the
   *  notes-for-coach field. */
  viewerIsSelf: boolean;
  /** Default kind selected when the dialog opens. */
  defaultKind?: Kind;
  onSaved: () => void;
}

export function LogActivityDialog({
  open,
  onOpenChange,
  teamId,
  playerId,
  playerName,
  viewerIsSelf,
  defaultKind = 'workout',
  onSaved,
}: Props) {
  const [kinds, setKinds] = useState<string[]>(FALLBACK_KINDS);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setDescription('');
    setNotes('');
    setErr(null);
  }, [open, defaultKind]);

  // Fetch the live allowed-kinds for this team each time the dialog opens.
  // On failure we keep the {workout, rehab} fallback so logging still works.
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/allowed-kinds`, { signal: ac.signal });
        if (!res.ok) return;
        const j = (await res.json()) as { kinds?: string[] };
        const next = Array.isArray(j.kinds) && j.kinds.length ? j.kinds : FALLBACK_KINDS;
        setKinds(next);
        // Keep the requested default if it's allowed; otherwise pick the first.
        setKind((cur) => (next.includes(cur) ? cur : next[0]));
      } catch {
        // aborted or network error — keep the fallback kinds
      }
    })();
    return () => ac.abort();
  }, [open, teamId]);

  async function save() {
    const desc = description.trim();
    if (!desc) {
      setErr('Add a short description.');
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await fetch('/api/activity-logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        player_id: playerId,
        kind,
        description: desc,
        notes: viewerIsSelf ? notes.trim() || undefined : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.detail ?? j.error ?? `Save failed (${res.status}).`);
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  const titleVerb = viewerIsSelf ? 'Log' : `Log for ${playerName}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titleVerb} activity</DialogTitle>
          <DialogDescription>
            Quick description of what got done. Body parts mentioned (e.g.
            &ldquo;quads, calves&rdquo;) feed the heatmap automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
              Kind
            </label>
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Activity kind"
            >
              {kinds.map((k) => {
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setKind(k)}
                    className={`rounded-md border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition ${
                      active
                        ? 'bg-[color:var(--ink)] text-[color:var(--paper)] border-[color:var(--ink)]'
                        : 'text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]'
                    }`}
                    style={active ? undefined : { borderColor: 'var(--border)' }}
                  >
                    {k.replace(/[_-]/g, ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="log-desc" className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
              Description
            </label>
            <textarea
              id="log-desc"
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                kind === 'workout'
                  ? 'e.g. squats 4×8, hamstring curls, 30 min stationary bike'
                  : kind === 'rehab'
                    ? 'e.g. shoulder mobility, band rotations, 15 min'
                    : `e.g. what you did for ${kind.replace(/[_-]/g, ' ')} — sets, distance, duration`
              }
              rows={4}
              maxLength={2000}
              className="w-full rounded-md border bg-[color:var(--paper)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-dim)] focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>

          {viewerIsSelf && (
            <div className="space-y-1.5">
              <label htmlFor="log-notes" className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                Notes for coach <span className="text-[color:var(--ink-dim)] normal-case">(optional)</span>
              </label>
              <Input
                id="log-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="anything coach should know — felt off, modified set, etc."
                maxLength={1000}
                className="h-9 text-[13px]"
              />
            </div>
          )}

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
          <Button onClick={save} disabled={saving || !description.trim()}>
            {saving ? 'Logging…' : 'Log'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
