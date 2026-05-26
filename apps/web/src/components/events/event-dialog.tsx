'use client';

// Add / edit dialog for a dated event (a `locations` row, kind='meet').
// Coaches type a place name; the server geocodes it for weather — no
// coordinate hunting. The training-site concept was dropped in the
// 2026-05-25 Events redesign, so this is events-only now.

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Location } from '@reflect-live/shared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number;
  /** Pass a location to edit; omit to create. */
  existing?: Location | null;
  onSaved: () => void;
}

export function EventDialog({ open, onOpenChange, teamId, existing, onSaved }: Props) {
  const editing = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [eventDate, setEventDate] = useState(existing?.event_date ?? '');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Reset local state whenever the dialog opens for a different target.
  function syncFromExisting() {
    setName(existing?.name ?? '');
    setEventDate(existing?.event_date ?? '');
    setPlace('');
    setErr(null);
    setNote(existing?.lat != null ? 'Weather tracking on. Leave the location field blank to keep it.' : null);
  }

  async function save() {
    setErr(null);
    setNote(null);
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) { setErr('Pick a date for the event.'); return; }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        kind: 'meet',
        event_date: eventDate,
      };
      if (place.trim()) payload.place = place.trim();

      const res = editing
        ? await fetch(`/api/locations/${existing!.id}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/locations', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ team_id: teamId, ...payload }),
          });
      const j = await res.json();
      if (!res.ok) { setErr(j.detail ?? j.error ?? 'save_failed'); return; }
      // Tell the coach if geocoding didn't resolve (only POST returns it).
      if (place.trim() && !editing && !j.geocoded) {
        setNote("Couldn't find that location for weather — event saved without weather tracking.");
        setTimeout(() => { onSaved(); onOpenChange(false); }, 1400);
        return;
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) syncFromExisting();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit event' : 'Add event'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Conference Championships" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Date</span>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="mono" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
              Location for weather <span className="font-normal lowercase">(optional)</span>
            </span>
            <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Chicago, IL or a venue name" />
            <span className="text-[11px] text-[color:var(--ink-mute)]">
              We&apos;ll look up coordinates for the weather chip. Leave blank to skip weather.
            </span>
          </label>

          {err && <div className="text-[12px]" style={{ color: 'var(--red)' }}>{err}</div>}
          {note && <div className="text-[12px]" style={{ color: 'var(--amber)' }}>{note}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
