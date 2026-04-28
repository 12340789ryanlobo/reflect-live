'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { BodyHeatmap } from '@/components/v3/body-heatmap';
import { Pill } from '@/components/v3/pill';
import { regionLabel } from '@/lib/injury-aliases';
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

export default function HeatmapPage() {
  const { prefs, role } = useDashboard();
  const sb = useSupabase();
  const [days, setDays] = useState(90);
  const [reports, setReports] = useState<InjuryRow[]>([]);
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | undefined>();
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
    const [{ data: rpts }, { data: ps }] = await Promise.all([
      sb.from('injury_reports')
        .select('*, player:players(name, group)')
        .eq('team_id', prefs.team_id)
        .gte('reported_at', lower)
        .order('reported_at', { ascending: false })
        .limit(500),
      sb.from('players').select('id,name').eq('team_id', prefs.team_id).eq('active', true).order('name'),
    ]);
    setReports((rpts ?? []) as InjuryRow[]);
    setPlayers((ps ?? []) as PlayerLite[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, prefs.team_id, days]);

  const counts: Record<string, number> = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of reports) {
      if (r.resolved_at) continue;
      for (const region of r.regions) c[region] = (c[region] ?? 0) + 1;
    }
    return c;
  }, [reports]);

  const activeReports = reports.filter((r) => !r.resolved_at);
  const filtered = selected
    ? activeReports.filter((r) => r.regions.includes(selected))
    : activeReports;

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
        <section className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
          {/* Heatmap */}
          <div className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[color:var(--ink)]">Active injuries</h2>
              {selected && (
                <button
                  className="text-[12px] text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]"
                  onClick={() => setSelected(undefined)}
                >clear filter</button>
              )}
            </div>
            <BodyHeatmap counts={counts} selected={selected} onRegionClick={setSelected} />
            <div className="mt-4 flex items-center gap-3 text-[11.5px] text-[color:var(--ink-mute)]">
              <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm" style={{ background: 'var(--paper-2)', border: '1px solid var(--border)' }} />none</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm" style={{ background: 'var(--green-soft)' }} />low</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm" style={{ background: '#FFF1D6' }} />med-low</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm" style={{ background: 'var(--amber-soft)' }} />med</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm" style={{ background: 'var(--red-soft)' }} />high</span>
            </div>
          </div>

          {/* Detail list */}
          <div className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">
                {selected ? `${regionLabel(selected)} reports` : 'Recent reports'}
              </h2>
              <span className="text-[11.5px] text-[color:var(--ink-mute)]">{filtered.length}</span>
            </header>
            {loading ? (
              <p className="px-6 py-8 text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
            ) : filtered.length === 0 ? (
              <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
                {selected ? 'No active reports for this region.' : 'No active injuries — nice.'}
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {filtered.slice(0, 30).map((r) => (
                  <li key={r.id} className="px-6 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/dashboard/player/${r.player_id}`}
                            className="text-[14px] font-semibold text-[color:var(--ink)] hover:underline"
                          >
                            {r.player?.name ?? '—'}
                          </Link>
                          {r.regions.map((region) => (
                            <Pill key={region} tone={selected === region ? 'blue' : 'mute'}>
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
      </main>
    </>
  );
}
