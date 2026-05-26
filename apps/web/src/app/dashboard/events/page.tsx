'use client';

// /dashboard/events — lean event timeline.
//
// Redesigned (2026-05-25) away from the weather-centric layout: the
// page is now a chronological list of dated events grouped by how
// soon they are. Weather is demoted to a small per-event chip (only
// for events that have a location); the old standalone weather grid,
// venue stations, and training-sites sections are gone.
//
// Training-site rows (kind='training') from the seed era simply don't
// appear here — they carry no date, so they're not timeline events.
// The data is untouched in the DB.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { EventDialog } from '@/components/events/event-dialog';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/lib/supabase-browser';
import type { Location, WeatherSnapshot } from '@reflect-live/shared';
import { prettyCalendarDate, daysUntilCalendarDate } from '@/lib/format';
import { Plus, Pencil, Trash2, CalendarDays, MapPin, Star } from 'lucide-react';

type EventRow = Location & { daysUntil: number };

interface Bucket {
  key: string;
  label: string;
  rows: EventRow[];
}

// Group upcoming events into relative-time buckets; past events get
// their own dimmed bucket at the end. Buckets render in this order
// and empty ones are skipped.
function bucketize(events: EventRow[]): Bucket[] {
  const thisWeek: EventRow[] = [];
  const thisMonth: EventRow[] = [];
  const later: EventRow[] = [];
  const past: EventRow[] = [];
  for (const e of events) {
    if (e.daysUntil < 0) past.push(e);
    else if (e.daysUntil <= 7) thisWeek.push(e);
    else if (e.daysUntil <= 30) thisMonth.push(e);
    else later.push(e);
  }
  // Past sorts most-recent-first; everything else soonest-first.
  past.sort((a, b) => b.daysUntil - a.daysUntil);
  return [
    { key: 'week', label: 'This week', rows: thisWeek },
    { key: 'month', label: 'This month', rows: thisMonth },
    { key: 'later', label: 'Later', rows: later },
    { key: 'past', label: 'Past', rows: past },
  ].filter((b) => b.rows.length > 0);
}

function countdownLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil > 1) return `in ${daysUntil} days`;
  if (daysUntil === -1) return 'Yesterday';
  return `${Math.abs(daysUntil)} days ago`;
}

export default function EventsPage() {
  const { prefs, team, role } = useDashboard();
  const sb = useSupabase();
  const canManage = role === 'coach' || role === 'admin';

  const [locs, setLocs] = useState<Location[]>([]);
  const [latest, setLatest] = useState<Record<number, WeatherSnapshot>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data: ls } = await sb
      .from('locations')
      .select('*')
      .eq('team_id', prefs.team_id)
      .order('event_date');
    setLocs((ls ?? []) as Location[]);
    const ids = (ls ?? []).map((l: Location) => l.id);
    if (ids.length) {
      const { data: snaps } = await sb
        .from('weather_snapshots')
        .select('*')
        .in('location_id', ids)
        .order('fetched_at', { ascending: false });
      const byLoc: Record<number, WeatherSnapshot> = {};
      for (const s of (snaps ?? []) as WeatherSnapshot[]) {
        if (!byLoc[s.location_id]) byLoc[s.location_id] = s;
      }
      setLatest(byLoc);
    } else {
      setLatest({});
    }
  }, [sb, prefs.team_id]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditTarget(null); setDialogOpen(true); }
  function openEdit(loc: Location) { setEditTarget(loc); setDialogOpen(true); }

  async function remove(loc: Location) {
    if (deleting !== null) return;
    if (!confirm(`Delete "${loc.name}"?`)) return;
    setDeleting(loc.id);
    const res = await fetch(`/api/locations/${loc.id}`, { method: 'DELETE' });
    setDeleting(null);
    if (res.ok) load();
    else alert('Delete failed.');
  }

  // Only dated events are timeline rows. Training-site rows are skipped.
  const events: EventRow[] = useMemo(
    () =>
      locs
        .filter((l) => l.kind === 'meet' && l.event_date)
        .map((l) => ({
          ...l,
          // Calendar-date day count — no UTC parse, no off-by-one vs
          // what the date picker shows.
          daysUntil: daysUntilCalendarDate(l.event_date!),
        })),
    [locs],
  );
  // Pinned upcoming events get their own "Key events" group at the top
  // and are pulled OUT of the regular time buckets so they don't show
  // twice. Pinned PAST events stay in the Past bucket (a key event
  // that's over isn't "key" anymore).
  const keyEvents = useMemo(
    () => events.filter((e) => e.is_pinned && e.daysUntil >= 0).sort((a, b) => a.daysUntil - b.daysUntil),
    [events],
  );
  const keyIds = useMemo(() => new Set(keyEvents.map((e) => e.id)), [keyEvents]);
  const buckets = useMemo(() => bucketize(events.filter((e) => !keyIds.has(e.id))), [events, keyIds]);
  const upcomingCount = events.filter((e) => e.daysUntil >= 0).length;
  const nextEvent = events.filter((e) => e.daysUntil >= 0).sort((a, b) => a.daysUntil - b.daysUntil)[0];

  // Shared row renderer so the Key-events group and the time buckets
  // render identical rows. `inKey` suppresses the blue "Next up" rail —
  // inside the amber Key-events group that blue stripe clashed with the
  // group's warm accent, and the group already signals importance.
  function renderRow(e: EventRow, isPast: boolean, inKey = false) {
    const isNext = !isPast && !inKey && nextEvent?.id === e.id;
    const snap = latest[e.id];
    const hasWeather = e.lat != null && snap;
    return (
      <li key={e.id} className="relative flex items-center gap-4 px-5 py-3.5" style={{ borderColor: 'var(--border)' }}>
        {/* Left accent as an inner stripe (not a CSS border) so it clips
            to the card's rounded corners exactly like... itself across
            rows. Amber for key events, blue for the single next-up. */}
        {inKey && <span aria-hidden className="absolute left-0 top-0 h-full w-[3px]" style={{ background: 'var(--amber)' }} />}
        {isNext && <span aria-hidden className="absolute left-0 top-0 h-full w-[3px]" style={{ background: 'var(--blue)' }} />}
        <div className="w-[88px] shrink-0">
          <div className="mono text-[12px] tabular text-[color:var(--ink)]">{prettyCalendarDate(e.event_date!)}</div>
          <div className="text-[11px]" style={{ color: isPast ? 'var(--ink-dim)' : e.daysUntil <= 1 ? 'var(--blue)' : 'var(--ink-mute)' }}>
            {countdownLabel(e.daysUntil)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {e.is_pinned && <Star className="size-3.5 shrink-0" style={{ color: 'var(--amber)' }} fill="var(--amber)" aria-label="Key event" />}
            <span className="text-[14px] font-semibold text-[color:var(--ink)] truncate">{e.name}</span>
          </div>
          {e.place_label && (
            <div className="flex items-center gap-1 text-[11.5px] text-[color:var(--ink-mute)] truncate">
              <MapPin className="size-3 shrink-0" />
              {e.place_label}
            </div>
          )}
          {isNext && (
            <div className="text-[10.5px] font-bold uppercase tracking-widest text-[color:var(--blue)]">Next up</div>
          )}
        </div>
        {hasWeather && (
          <div className="mono text-[12px] tabular shrink-0" style={{ color: 'var(--ink-soft)' }}>
            <span style={{ color: 'var(--blue)' }}>{snap.temp_c != null ? `${Math.round(snap.temp_c)}°C` : '—'}</span>
            {snap.wind_kph != null && <span className="text-[color:var(--ink-mute)]"> · {Math.round(snap.wind_kph)}kph</span>}
          </div>
        )}
        {canManage && (
          <span className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => openEdit(e)} className="text-[color:var(--ink-mute)] hover:text-[color:var(--blue)] transition" aria-label="Edit event">
              <Pencil className="size-3.5" />
            </button>
            <button type="button" onClick={() => remove(e)} disabled={deleting === e.id} className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)] transition disabled:opacity-50" aria-label="Delete event">
              <Trash2 className="size-3.5" />
            </button>
          </span>
        )}
      </li>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Events"
        subtitle={
          upcomingCount === 0
            ? 'No upcoming events'
            : `${upcomingCount} upcoming · next ${nextEvent ? countdownLabel(nextEvent.daysUntil).toLowerCase() : ''}`
        }
        actions={canManage ? (
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="size-3.5" />
            Add event
          </Button>
        ) : undefined}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8 w-full max-w-[1100px] mx-auto">
        {events.length === 0 ? (
          <section className="reveal rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: 'var(--border-2)' }}>
            <CalendarDays className="size-7 mx-auto mb-3" style={{ color: 'var(--ink-dim)' }} />
            <p className="text-[13px] text-[color:var(--ink-mute)]">No events scheduled yet.</p>
            {canManage && (
              <Button size="sm" onClick={openCreate} className="mt-3 gap-1.5">
                <Plus className="size-3.5" /> Add your first event
              </Button>
            )}
          </section>
        ) : (
          <>
            {/* Key events — pinned + upcoming, emphasized at the top. */}
            {keyEvents.length > 0 && (
              <section className="reveal reveal-1">
                <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--amber)' }}>
                  <Star className="size-3.5" fill="var(--amber)" />
                  Key events
                </h2>
                {/* Same card shape as every other group — the amber
                    accent is a per-row inner stripe (see renderRow), so
                    it clips to the rounded corners identically. */}
                <ul
                  className="rounded-2xl border overflow-hidden divide-y"
                  style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                >
                  {keyEvents.map((e) => renderRow(e, false, true))}
                </ul>
              </section>
            )}

            {buckets.map((bucket, bi) => {
              const isPast = bucket.key === 'past';
              return (
                <section key={bucket.key} className={`reveal reveal-${Math.min(bi + 2, 4)}`}>
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-[color:var(--ink-mute)] mb-2 px-1">
                    {bucket.label}
                  </h2>
                  <ul className="rounded-2xl border overflow-hidden divide-y" style={{ borderColor: 'var(--border)', background: 'var(--card)', opacity: isPast ? 0.7 : 1 }}>
                    {bucket.rows.map((e) => renderRow(e, isPast))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </main>

      {canManage && team?.id && (
        <EventDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          teamId={team.id}
          existing={editTarget}
          onSaved={load}
        />
      )}
    </>
  );
}
