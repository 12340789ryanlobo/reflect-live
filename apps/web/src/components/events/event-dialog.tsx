'use client';

// Add / edit dialog for a dated event (a `locations` row, kind='meet').
//
// Location is a live search-as-you-type picker backed by Open-Meteo's
// keyless geocoding API (CORS-friendly, same provider as the weather
// poll). The coach picks a resolved place from the dropdown, so we
// capture exact lat/lon up front — no guess-and-check, no "did it
// geocode?" uncertainty after save. Blank location = no weather.

import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Location } from '@reflect-live/shared';
import { MapPin, X, Loader2, Star } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number;
  existing?: Location | null;
  onSaved: () => void;
}

// Matches the /api/geocode (Nominatim) response — indexes universities,
// venues, and cities, not just populated places.
interface GeoHit {
  id: number;
  label: string;
  lat: number;
  lon: number;
}

interface PickedPlace {
  label: string;
  lat: number;
  lon: number;
}

export function EventDialog({ open, onOpenChange, teamId, existing, onSaved }: Props) {
  const editing = !!existing;
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Location picker state.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  // True when editing an event that already has coords but the coach
  // hasn't touched the picker — we keep its weather as-is on save.
  const [keepExistingWeather, setKeepExistingWeather] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefill whenever the dialog opens or the target changes. This must
  // be an effect, not an onOpenChange handler: the parent opens the
  // dialog programmatically (setDialogOpen(true)), and Radix only fires
  // onOpenChange for USER-initiated open/close — so a handler-based
  // prefill never ran on the edit path, leaving the form blank.
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? '');
    setEventDate(existing?.event_date ?? '');
    setPinned(existing?.is_pinned ?? false);
    setQuery('');
    setResults([]);
    setPicked(null);
    setErr(null);
    setKeepExistingWeather(existing?.lat != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  // Debounced geocoding search. Skips when a place is already picked
  // or the query is too short.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (picked || query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' });
        const j = (await r.json()) as { results?: GeoHit[] };
        setResults(j.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, picked]);

  function pick(h: GeoHit) {
    setPicked({ label: h.label, lat: h.lat, lon: h.lon });
    setQuery('');
    setResults([]);
    setKeepExistingWeather(false);
  }

  function clearWeather() {
    setPicked(null);
    setQuery('');
    setResults([]);
    setKeepExistingWeather(false);
  }

  async function save() {
    setErr(null);
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) { setErr('Pick a date for the event.'); return; }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        kind: 'meet',
        event_date: eventDate,
        is_pinned: pinned,
      };
      // Coordinate resolution:
      //   - picked a new place → send its exact lat/lon
      //   - editing + keeping existing weather → omit coords (PATCH leaves them)
      //   - otherwise → explicitly clear (null) so "remove weather" works
      if (picked) {
        payload.lat = picked.lat;
        payload.lon = picked.lon;
        payload.place_label = picked.label;
      } else if (editing && !keepExistingWeather) {
        payload.lat = null;
        payload.lon = null;
      }

      const res = editing
        ? await fetch(`/api/locations/${existing!.id}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/locations', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ team_id: teamId, ...payload }),
          });
      const j = await res.json();
      if (!res.ok) { setErr(j.detail ?? j.error ?? 'save_failed'); return; }
      onSaved();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

          {/* Pin / key-event toggle */}
          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition"
            style={{
              borderColor: pinned ? 'var(--amber)' : 'var(--border)',
              background: pinned ? 'var(--amber-soft)' : 'transparent',
            }}
          >
            <span className="flex items-center gap-2 text-[13px]">
              <Star className="size-4" style={{ color: pinned ? 'var(--amber)' : 'var(--ink-mute)' }} fill={pinned ? 'var(--amber)' : 'none'} />
              <span className="text-[color:var(--ink)]">Key event</span>
            </span>
            <span className="text-[11px] text-[color:var(--ink-mute)]">
              {pinned ? 'Pinned to top' : 'Tap to pin'}
            </span>
          </button>

          {/* Location picker */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
              Location for weather <span className="font-normal lowercase">(optional)</span>
            </span>

            {picked ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2" style={{ borderColor: 'var(--blue)', background: 'var(--blue-soft)' }}>
                <span className="flex items-center gap-2 text-[13px] text-[color:var(--ink)]">
                  <MapPin className="size-3.5" style={{ color: 'var(--blue)' }} />
                  {picked.label}
                </span>
                <button type="button" onClick={clearWeather} className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)] transition" aria-label="Clear location">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : keepExistingWeather ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                <span className="flex items-center gap-2 text-[13px] text-[color:var(--ink-soft)] min-w-0">
                  <MapPin className="size-3.5 shrink-0" style={{ color: 'var(--green)' }} />
                  <span className="truncate">{existing?.place_label ?? 'Weather tracking on'}</span>
                </span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setKeepExistingWeather(false)} className="text-[11px] font-semibold text-[color:var(--blue)] hover:underline">Change</button>
                  <button type="button" onClick={clearWeather} className="text-[11px] font-semibold text-[color:var(--red)] hover:underline">Remove</button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a city or venue — e.g. Chicago"
                  autoComplete="off"
                />
                {searching && (
                  <Loader2 className="size-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-mute)]" />
                )}
                {results.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-md border bg-[color:var(--card)] shadow-[var(--shadow)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    {results.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => pick(h)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[color:var(--card-hover)] transition"
                        >
                          <MapPin className="size-3.5 shrink-0 text-[color:var(--ink-mute)]" />
                          <span className="text-[color:var(--ink)]">{h.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.trim().length >= 2 && !searching && results.length === 0 && (
                  <p className="mt-1 text-[11px] text-[color:var(--ink-mute)]">No matches — try a city name.</p>
                )}
              </div>
            )}
            <span className="text-[11px] text-[color:var(--ink-mute)]">
              Pick a place to show a weather chip on the event. Leave blank to skip.
            </span>
          </div>

          {err && <div className="text-[12px]" style={{ color: 'var(--red)' }}>{err}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
