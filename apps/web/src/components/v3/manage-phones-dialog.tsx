'use client';

// Per-athlete phone manager. Lists every number in player_phones for
// one player, lets the caller add a new one (with optional label),
// star one as primary, or delete an alternate. Used by both coaches
// (managing any athlete on their team) and the athlete themselves
// (managing their own numbers). Server enforces the same access
// gate; the dialog just exposes whatever the GET returns.
//
// Phone input uses the same react-phone-number-input widget as the
// onboarding flow — country picker + per-country length cap.

import { useCallback, useEffect, useState } from 'react';
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
import { Pill } from '@/components/v3/pill';
import { Star, Trash2, Plus } from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { prettyPhone } from '@/lib/format';

interface PhoneRow {
  id: number;
  e164: string;
  label: string | null;
  is_primary: boolean;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: number;
  playerName: string;
  /** Called after any add/promote/delete so the parent can refresh
   *  derived state (e.g. the identity card's primary phone). */
  onSaved: () => void;
}

export function ManagePhonesDialog({ open, onOpenChange, playerId, playerName, onSaved }: Props) {
  const [phones, setPhones] = useState<PhoneRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newPhone, setNewPhone] = useState<string | undefined>(undefined);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/players/${playerId}/phones`);
    if (!r.ok) {
      setPhones([]);
      return;
    }
    const j = await r.json();
    setPhones((j.phones ?? []) as PhoneRow[]);
  }, [playerId]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setAddOpen(false);
    setNewPhone(undefined);
    setNewLabel('');
    void load();
  }, [open, load]);

  async function promote(p: PhoneRow) {
    if (p.is_primary) return;
    setBusy(p.id);
    setErr(null);
    const res = await fetch(`/api/players/${playerId}/phones/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_primary: true }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.detail ?? j.error ?? `Promote failed (${res.status}).`);
      return;
    }
    await load();
    onSaved();
  }

  async function remove(p: PhoneRow) {
    if (p.is_primary) {
      setErr('Promote a different phone first, then delete this one.');
      return;
    }
    const ok = confirm(
      `Delete ${prettyPhone(p.e164)}${p.label ? ` (${p.label})` : ''}? This can't be undone.`,
    );
    if (!ok) return;
    setBusy(p.id);
    setErr(null);
    const res = await fetch(`/api/players/${playerId}/phones/${p.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.detail ?? j.error ?? `Delete failed (${res.status}).`);
      return;
    }
    await load();
    onSaved();
  }

  async function add() {
    if (!newPhone || !isValidPhoneNumber(newPhone)) {
      setErr('Enter a valid phone for the selected country.');
      return;
    }
    setAdding(true);
    setErr(null);
    const res = await fetch(`/api/players/${playerId}/phones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        e164: newPhone,
        label: newLabel.trim() || undefined,
        // First phone is auto-primary on the server, so we don't need
        // to set is_primary explicitly. Coach can promote later.
      }),
    });
    setAdding(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.detail ?? j.error ?? `Add failed (${res.status}).`);
      return;
    }
    setAddOpen(false);
    setNewPhone(undefined);
    setNewLabel('');
    await load();
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{playerName}&rsquo;s phones</DialogTitle>
          <DialogDescription>
            Add alternate numbers (e.g. US + home country for international
            students) and pick which one is the default. Inbound SMS from any
            of these numbers will land on this athlete&rsquo;s timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {phones === null ? (
            <p className="text-[13px] text-[color:var(--ink-mute)] py-4 text-center">
              Loading…
            </p>
          ) : phones.length === 0 ? (
            <p className="text-[13px] text-[color:var(--ink-mute)] py-4 text-center">
              No phones on file. Add one below.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {phones.map((p) => {
                const isBusy = busy === p.id;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="mono text-[13px] text-[color:var(--ink)] font-semibold">
                          {prettyPhone(p.e164)}
                        </span>
                        {p.is_primary && <Pill tone="blue">Default</Pill>}
                        {p.label && <Pill tone="mute">{p.label}</Pill>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!p.is_primary && (
                        <button
                          type="button"
                          onClick={() => promote(p)}
                          disabled={isBusy}
                          aria-label="Make default"
                          title="Make default"
                          className="rounded-md p-1.5 text-[color:var(--ink-mute)] hover:text-[color:var(--blue)] disabled:opacity-50"
                        >
                          <Star className="size-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        disabled={isBusy || p.is_primary}
                        aria-label="Delete"
                        title={p.is_primary ? 'Promote another phone first' : 'Delete'}
                        className="rounded-md p-1.5 text-[color:var(--ink-mute)] hover:text-[color:var(--red)] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {addOpen ? (
            <div
              className="mt-3 space-y-2 rounded-md border p-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <PhoneInput
                international
                defaultCountry="US"
                countryCallingCodeEditable={false}
                value={newPhone}
                onChange={(v) => setNewPhone(v)}
                placeholder="555 123 4567"
                autoComplete="tel"
                className="phone-input"
              />
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (optional) — e.g. Home, WhatsApp"
                maxLength={40}
                className="h-9 text-[13px]"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => { setAddOpen(false); setErr(null); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={add}
                  disabled={adding || !newPhone || !isValidPhoneNumber(newPhone)}
                >
                  {adding ? 'Adding…' : 'Add phone'}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setAddOpen(true); setErr(null); }}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--blue)] hover:text-[color:var(--ink)] transition"
            >
              <Plus className="size-3.5" /> Add another number
            </button>
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
