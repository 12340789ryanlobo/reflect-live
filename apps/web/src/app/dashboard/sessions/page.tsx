'use client';

// Sessions list — practice/match/lifting cohorts. Coaches/captains can
// create new sessions; rows show progress (deliveries completed / total)
// and any flags raised. Soft-deleted rows are hidden.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from '@/components/v3/pill';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Search, Trash2 } from 'lucide-react';
import { prettyDateTime, relativeTime } from '@/lib/format';
import type { SessionType } from '@reflect-live/shared';

interface SessionRow {
  id: number;
  type: SessionType;
  label: string;
  template_id: number | null;
  created_at: string;
  delivered_count: number;
  completed_count: number;
  flag_count: number;
}

interface TemplateLite { id: number; name: string; session_type: SessionType }

const TYPE_TONE: Record<SessionType, 'blue' | 'amber' | 'green'> = {
  practice: 'blue',
  match: 'amber',
  lifting: 'green',
};

export default function SessionsPage() {
  const { prefs, role } = useDashboard();
  const sb = useSupabase();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SessionType>('all');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [formType, setFormType] = useState<SessionType>('practice');
  const [formLabel, setFormLabel] = useState('');
  const [formTemplateId, setFormTemplateId] = useState<string>('');
  const canCreate = role === 'coach' || role === 'captain' || role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: ss }, { data: ds }, { data: fs }, { data: tpls }] = await Promise.all([
      sb.from('sessions')
        .select('id,type,label,template_id,created_at,deleted_at')
        .eq('team_id', prefs.team_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200),
      sb.from('deliveries').select('session_id,status'),
      sb.from('flags').select('session_id'),
      sb.from('question_templates')
        .select('id,name,session_type')
        .eq('team_id', prefs.team_id)
        .order('name'),
    ]);
    const dCounts = new Map<number, { total: number; done: number }>();
    for (const d of (ds ?? []) as Array<{ session_id: number; status: string }>) {
      const cur = dCounts.get(d.session_id) ?? { total: 0, done: 0 };
      cur.total += 1;
      if (d.status === 'completed') cur.done += 1;
      dCounts.set(d.session_id, cur);
    }
    const fCounts = new Map<number, number>();
    for (const f of (fs ?? []) as Array<{ session_id: number }>) {
      fCounts.set(f.session_id, (fCounts.get(f.session_id) ?? 0) + 1);
    }
    const enriched: SessionRow[] = ((ss ?? []) as Array<Omit<SessionRow, 'delivered_count' | 'completed_count' | 'flag_count'>>).map((s) => ({
      ...s,
      delivered_count: dCounts.get(s.id)?.total ?? 0,
      completed_count: dCounts.get(s.id)?.done ?? 0,
      flag_count: fCounts.get(s.id) ?? 0,
    }));
    setRows(enriched);
    setTemplates((tpls ?? []) as TemplateLite[]);
    setLoading(false);
  }, [sb, prefs.team_id]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (q && !r.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, typeFilter]);

  async function submit() {
    setSaving(true); setErrMsg(null);
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: formType,
        label: formLabel,
        template_id: formTemplateId ? Number(formTemplateId) : null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      setFormLabel(''); setFormTemplateId(''); setFormType('practice');
      await load();
    } else {
      const j = await res.json().catch(() => ({}));
      setErrMsg(j.error ?? 'save failed');
    }
  }

  async function softDelete(s: SessionRow) {
    if (!confirm(`Delete "${s.label}"? Responses stay; the session will be hidden.`)) return;
    const res = await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  const stats = useMemo(() => {
    const total = rows.length;
    const practice = rows.filter((r) => r.type === 'practice').length;
    const match = rows.filter((r) => r.type === 'match').length;
    const lifting = rows.filter((r) => r.type === 'lifting').length;
    return { total, practice, match, lifting };
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="Survey engine"
        title="Sessions"
        subtitle={`${stats.total} session${stats.total === 1 ? '' : 's'} — ${stats.practice} practice · ${stats.match} match · ${stats.lifting} lifting`}
        actions={
          canCreate ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">New session</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create a session</DialogTitle></DialogHeader>
                <div className="grid gap-4 pt-2">
                  <div className="grid gap-1.5">
                    <label className="text-[12.5px] font-semibold" htmlFor="type">Type</label>
                    <Select value={formType} onValueChange={(v) => setFormType(v as SessionType)}>
                      <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="practice">Practice</SelectItem>
                        <SelectItem value="match">Match</SelectItem>
                        <SelectItem value="lifting">Lifting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[12.5px] font-semibold" htmlFor="label">Label</label>
                    <Input
                      id="label"
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      placeholder="e.g. Tuesday AM, vs Wash U Saturday"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[12.5px] font-semibold" htmlFor="tmpl">Template (optional)</label>
                    <Select value={formTemplateId} onValueChange={setFormTemplateId}>
                      <SelectTrigger id="tmpl">
                        <SelectValue placeholder="— use default questions —" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.filter((t) => t.session_type === formType).map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11.5px] text-[color:var(--ink-mute)]">
                      No outbound texts go out yet — sessions are in shadow mode while we soak.
                    </p>
                  </div>
                  {errMsg && <p className="text-[12.5px] text-[color:var(--red)]">{errMsg}</p>}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={submit} disabled={saving || !formLabel.trim()}>
                      {saving ? 'Creating…' : 'Create'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      <main className="px-6 pb-12 pt-4 space-y-6">
        <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex flex-wrap items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[color:var(--ink-mute)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sessions…"
                className="pl-9 h-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | SessionType)}>
              <SelectTrigger className="w-[140px] h-9 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="practice">Practice</SelectItem>
                <SelectItem value="match">Match</SelectItem>
                <SelectItem value="lifting">Lifting</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11.5px] text-[color:var(--ink-mute)]">{filtered.length} shown</span>
          </header>

          {loading ? (
            <p className="px-6 py-10 text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-[color:var(--ink-mute)]">
              {rows.length === 0
                ? 'No sessions yet. Create one to start collecting check-ins.'
                : 'No sessions match these filters.'}
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {filtered.map((s) => {
                const completion = s.delivered_count > 0
                  ? Math.round((s.completed_count / s.delivered_count) * 100)
                  : 0;
                return (
                  <li key={s.id} className="px-6 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/dashboard/sessions/${s.id}`}
                            className="text-[14px] font-semibold text-[color:var(--ink)] hover:underline"
                          >
                            {s.label}
                          </Link>
                          <Pill tone={TYPE_TONE[s.type]}>{s.type}</Pill>
                          {s.flag_count > 0 && (
                            <Pill tone="red">{s.flag_count} flag{s.flag_count === 1 ? '' : 's'}</Pill>
                          )}
                        </div>
                        <p
                          className="mt-1 mono text-[11px] text-[color:var(--ink-mute)] tabular"
                          title={prettyDateTime(s.created_at)}
                        >
                          created {relativeTime(s.created_at)}
                          {s.delivered_count > 0 && (
                            <> · {s.completed_count}/{s.delivered_count} responded ({completion}%)</>
                          )}
                        </p>
                      </div>
                      {(role === 'coach' || role === 'admin') && (
                        <button
                          type="button"
                          onClick={() => softDelete(s)}
                          aria-label="Delete session"
                          className="rounded p-1.5 text-[color:var(--ink-mute)] hover:bg-[color:var(--paper-2)] hover:text-[color:var(--red)]"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
