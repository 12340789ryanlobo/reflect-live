'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { HeatmapTabs, type InjurySideRow } from '@/components/v3/heatmap-tabs';
import { Pill } from '@/components/v3/pill';
import { parseAllRegions, regionLabel } from '@/lib/injury-aliases';
import { regionToMuscles } from '@/lib/region-to-muscle';
import type { ActivityLog } from '@reflect-live/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { prettyDate, relativeTime } from '@/lib/format';

const DAY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: 'Year' },
  { value: '0', label: 'All time' },
];

interface InjuryRow {
  id: number;
  player_id: number;
  regions: string[];
  severity: number | null;
  description: string;
  reported_at: string;
  resolved_at: string | null;
  player: { name: string; group: string | null } | null;
}

interface PlayerLite { id: number; name: string }

// Joints with no body-map shape shouldn't be credited as 'muscles
// worked' on the activity / rehab tabs (same logic as the player page).
function paintsAnyMuscle(region: string): boolean {
  return regionToMuscles(region, 'front').length > 0
    || regionToMuscles(region, 'back').length > 0;
}

function aggregateActivityCounts(logs: ActivityLog[], kind: 'workout' | 'rehab'): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of logs) {
    if (r.kind !== kind || r.hidden) continue;
    for (const region of parseAllRegions(r.description)) {
      if (!paintsAnyMuscle(region)) continue;
      counts[region] = (counts[region] ?? 0) + 1;
    }
  }
  return counts;
}

export default function HeatmapPage() {
  const { prefs, team, role } = useDashboard();
  const sb = useSupabase();
  const [days, setDays] = useState(90);
  const [reports, setReports] = useState<InjuryRow[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canIntake = role === 'coach' || role === 'captain' || role === 'admin';

  const [formPlayerId, setFormPlayerId] = useState<string>('');
  const [formDescription, setFormDescription] = useState('');
  const [formSeverity, setFormSeverity] = useState<string>('');

  async function refresh() {
    setLoading(true);
    const lower = days === 0 ? new Date(0).toISOString() : new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const [{ data: rpts }, { data: ps }, { data: logs }] = await Promise.all([
      sb.from('injury_reports')
        .select('*, player:players(name, group)')
        .eq('team_id', prefs.team_id)
        .gte('reported_at', lower)
        .order('reported_at', { ascending: false })
        .limit(500),
      sb.from('players').select('id,name').eq('team_id', prefs.team_id).eq('active', true).order('name'),
      // Team-wide activity logs feed the activity + rehab heatmap tabs.
      sb.from('activity_logs')
        .select('*')
        .eq('team_id', prefs.team_id)
        .gte('logged_at', lower)
        .order('logged_at', { ascending: false })
        .limit(2000),
    ]);
    setReports((rpts ?? []) as InjuryRow[]);
    setPlayers((ps ?? []) as PlayerLite[]);
    setActivityLogs((logs ?? []) as ActivityLog[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, prefs.team_id, days]);

  const injuryCounts: Record<string, number> = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of reports) {
      if (r.resolved_at) continue;
      for (const region of r.regions) c[region] = (c[region] ?? 0) + 1;
    }
    return c;
  }, [reports]);

  const activityCounts = useMemo(
    () => aggregateActivityCounts(activityLogs, 'workout'),
    [activityLogs],
  );
  const rehabCounts = useMemo(
    () => aggregateActivityCounts(activityLogs, 'rehab'),
    [activityLogs],
  );

  // Side-list rows for the injury tab inside HeatmapTabs (separate from
  // the detailed reports list further down the page — that one carries
  // player names and resolve actions which the side panel doesn't).
  const injurySideRows = useMemo<InjurySideRow[]>(
    () =>
      reports
        .filter((r) => !r.resolved_at)
        .map((r) => ({
          id: r.id,
          regions: r.regions,
          severity: r.severity,
          description: r.player?.name
            ? `${r.player.name} — ${r.description}`
            : r.description,
          reportedAt: r.reported_at,
        })),
    [reports],
  );

  const activeReports = reports.filter((r) => !r.resolved_at);
  const filtered = selectedRegions.length
    ? activeReports.filter((r) => r.regions.some((x) => selectedRegions.includes(x)))
    : activeReports;
  const otherReports = activeReports.filter(
    (r) => r.regions.length === 0 || (r.regions.length === 1 && r.regions[0] === 'other'),
  );

  async function submitReport() {
    setSavingNew(true);
    setErrorMsg(null);
    const res = await fetch('/api/injury-reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        player_id: Number(formPlayerId) || undefined,
        description: formDescription,
        severity: formSeverity ? Number(formSeverity) : undefined,
      }),
    });
    setSavingNew(false);
    if (res.ok) {
      setOpen(false);
      setFormPlayerId(''); setFormDescription(''); setFormSeverity('');
      await refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setErrorMsg(j.error ?? 'save failed');
    }
  }

  async function toggleResolved(r: InjuryRow) {
    const res = await fetch(`/api/injury-reports/${r.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved: !r.resolved_at }),
    });
    if (res.ok) refresh();
  }

  async function deleteReport(r: InjuryRow) {
    if (!confirm('Delete this report?')) return;
    const res = await fetch(`/api/injury-reports/${r.id}`, { method: 'DELETE' });
    if (res.ok) refresh();
  }

  return (
    <>
      <PageHeader
        eyebrow="Body map"
        title="Heatmap"
        subtitle={`${activeReports.length} active report${activeReports.length === 1 ? '' : 's'}`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[140px] h-9 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
            {canIntake && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">Log injury</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log an injury</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 pt-2">
                    <div className="grid gap-1.5">
                      <label className="text-[12.5px] font-semibold text-[color:var(--ink)]" htmlFor="player">Athlete</label>
                      <Select value={formPlayerId} onValueChange={setFormPlayerId}>
                        <SelectTrigger id="player"><SelectValue placeholder="Pick an athlete" /></SelectTrigger>
                        <SelectContent>
                          {players.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-[12.5px] font-semibold text-[color:var(--ink)]" htmlFor="desc">What hurts? (free text)</label>
                      <textarea
                        id="desc"
                        rows={3}
                        placeholder="e.g. Left knee, sharp pain when sprinting"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        className="rounded-md border bg-[color:var(--card)] px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--blue)]/40"
                        style={{ borderColor: 'var(--border)' }}
                      />
                      <p className="text-[11.5px] text-[color:var(--ink-mute)]">
                        We&rsquo;ll auto-tag body regions from the description.
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-[12.5px] font-semibold text-[color:var(--ink)]" htmlFor="sev">Severity (optional, 1-5)</label>
                      <Input
                        id="sev"
                        type="number"
                        min={1} max={5}
                        value={formSeverity}
                        onChange={(e) => setFormSeverity(e.target.value)}
                      />
                    </div>
                    {errorMsg && <p className="text-[12.5px] text-[color:var(--red)]">{errorMsg}</p>}
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="ghost" onClick={() => setOpen(false)} disabled={savingNew}>Cancel</Button>
                      <Button
                        onClick={submitReport}
                        disabled={savingNew || !formPlayerId || !formDescription.trim()}
                      >
                        {savingNew ? 'Saving…' : 'Log'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <main className="px-6 pb-12 pt-4 space-y-6">
        {/* Tabbed body map — Injury / Activity / Rehab. Same component
            as the player page, fed with team-wide aggregates. Click a
            muscle to filter the detailed reports list below by region. */}
        <HeatmapTabs
          injuryCounts={injuryCounts}
          activityCounts={activityCounts}
          rehabCounts={rehabCounts}
          injuryRows={injurySideRows}
          gender={team.default_gender ?? 'male'}
          selectedRegions={selectedRegions}
          onMuscleClick={(regions) => {
            const next = Array.from(new Set(regions)).sort();
            const same =
              selectedRegions.length === next.length &&
              selectedRegions.every((r, i) => r === next[i]);
            setSelectedRegions(same ? [] : next);
          }}
        />

        <section>
          {/* Detail list — separate from the HeatmapTabs side panel
              because this one carries player names + resolve actions. */}
          <div className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">
                {selectedRegions.length > 0
                  ? selectedRegions.length === 1
                    ? `${regionLabel(selectedRegions[0])} reports`
                    : `${selectedRegions.map(regionLabel).join(' / ')} reports`
                  : 'Recent reports'}
              </h2>
              <span className="text-[11.5px] text-[color:var(--ink-mute)]">{filtered.length}</span>
            </header>
            {loading ? (
              <p className="px-6 py-8 text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
            ) : filtered.length === 0 ? (
              <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
                {selectedRegions.length > 0 ? 'No active reports for this region.' : 'No active injuries — nice.'}
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {filtered.slice(0, 30).map((r) => (
                  <li key={r.id} className="px-6 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/dashboard/players/${r.player_id}`}
                            className="text-[14px] font-semibold text-[color:var(--ink)] hover:underline"
                          >
                            {r.player?.name ?? '—'}
                          </Link>
                          {r.regions.map((region) => (
                            <Pill key={region} tone={selectedRegions.includes(region) ? 'blue' : 'mute'}>
                              {regionLabel(region)}
                            </Pill>
                          ))}
                          {r.severity && (
                            <Pill tone={r.severity >= 4 ? 'red' : r.severity >= 3 ? 'amber' : 'green'}>
                              sev {r.severity}
                            </Pill>
                          )}
                        </div>
                        <p className="mt-1 text-[13px] text-[color:var(--ink-soft)]">{r.description}</p>
                        <p
                          className="mt-1 mono text-[11px] text-[color:var(--ink-mute)] tabular"
                          title={prettyDate(r.reported_at)}
                        >
                          {relativeTime(r.reported_at)}
                        </p>
                      </div>
                      {canIntake && (
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleResolved(r)}
                            className="text-[11px] uppercase tracking-wide font-bold text-[color:var(--green)] hover:underline"
                          >Mark resolved</button>
                          {(role === 'coach' || role === 'admin') && (
                            <button
                              type="button"
                              onClick={() => deleteReport(r)}
                              className="text-[11px] uppercase tracking-wide font-bold text-[color:var(--red)] hover:underline"
                            >Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {otherReports.length > 0 && (
          <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Other / unmapped reports</h2>
              <span className="text-[11.5px] text-[color:var(--ink-mute)]">{otherReports.length}</span>
            </header>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {otherReports.slice(0, 20).map((r) => (
                <li key={r.id} className="px-6 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/dashboard/players/${r.player_id}`} className="text-[14px] font-semibold text-[color:var(--ink)] hover:underline">
                        {r.player?.name ?? '—'}
                      </Link>
                      <p className="text-[13px] text-[color:var(--ink-soft)]">{r.description}</p>
                    </div>
                    <span className="mono text-[11px] text-[color:var(--ink-mute)] tabular shrink-0" title={prettyDate(r.reported_at)}>
                      {relativeTime(r.reported_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
