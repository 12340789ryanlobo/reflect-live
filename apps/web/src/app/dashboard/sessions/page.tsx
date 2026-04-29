'use client';

// Sessions list — practice/competition/lifting cohorts. Coaches/captains can
// create new sessions; rows show progress (deliveries completed / total)
// and any flags raised. Soft-deleted rows are hidden.
//
// Internally the DB enum still uses 'match' (matches reflect's source-of-truth
// schema so the shadow-soak diff stays clean). Everywhere a coach sees it,
// it's labelled 'Competition'.

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
import { CalendarClock, Search, Trash2, X } from 'lucide-react';
import { prettyDateTime, relativeTime } from '@/lib/format';
import { DateTimePicker } from '@/components/v3/datetime-picker';
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

interface UpcomingSend {
  id: number;
  scheduled_at: string;
  channel: 'whatsapp' | 'sms';
  group_filter: string | null;
  player_ids_json: number[] | null;
  session_id: number;
  session_label: string;
  session_type: SessionType;
}

const TYPE_TONE: Record<SessionType, 'blue' | 'amber' | 'green'> = {
  practice: 'blue',
  match: 'amber',
  lifting: 'green',
};

const TYPE_LABEL: Record<SessionType, string> = {
  practice: 'Practice',
  match: 'Competition',
  lifting: 'Lifting',
};

// Time-of-day buckets for the auto-label. Morning: 4am–11am, midday: noon–3pm,
// afternoon: 4pm–7pm, evening: 8pm onwards. Tuned to swim-team practice
// rhythms — most squads have AM/PM workouts, lifts in the afternoon, and
// meets that are dated rather than time-bucketed.
function timeBucket(d: Date): string {
  const h = d.getHours();
  if (h < 11) return 'AM';
  if (h < 16) return 'midday';
  if (h < 20) return 'PM';
  return 'evening';
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Auto-generate a session label from the scheduled-send time + type. Coach
 * picks the date/time the survey will go out and we name the session for
 * them. They can overwrite it; if they don't, this is what gets saved.
 *
 * Standardized template: "{weekday} {time-bucket} {type}"
 *   practice    → "Wed PM practice"
 *   lifting     → "Wed PM lifting"
 *   competition → "Wed PM competition"
 *
 * Same skeleton across all session types so labels sort and read
 * predictably; only the trailing type-word changes.
 */
function autoLabel(type: SessionType, when: Date): string {
  const day = WEEKDAY[when.getDay()];
  const bucket = timeBucket(when);
  const noun =
    type === 'lifting' ? 'lifting'
    : type === 'match' ? 'competition'
    : 'practice';
  return `${day} ${bucket} ${noun}`;
}

/**
 * Default scheduled-for time for new sessions: today at 5pm if it's still
 * earlier than that, otherwise tomorrow at 5pm. Rounded to the half hour.
 * 5pm is when most squads finish on-deck training and the survey can run
 * the recap loop while it's fresh.
 */
function defaultScheduledFor(now = new Date()): Date {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(17, 0);
  if (d <= now) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}


export default function SessionsPage() {
  const { prefs, role } = useDashboard();
  const sb = useSupabase();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingSend[]>([]);
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
  const [formScheduledAt, setFormScheduledAt] = useState<Date>(() => defaultScheduledFor());
  const [formChannel, setFormChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  // Track whether the coach has hand-edited the label. While untouched, we
  // re-prefill it whenever they change the type or scheduled-for so the
  // suggestion stays in sync. Once they type anything, we stop touching it.
  const [labelEdited, setLabelEdited] = useState(false);
  const canCreate = role === 'coach' || role === 'captain' || role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: ss }, { data: ds }, { data: fs }, { data: tpls }, { data: pendingSends }] = await Promise.all([
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
      sb.from('scheduled_sends')
        .select('id,scheduled_at,channel,group_filter,player_ids_json,session_id,sessions!inner(label,type,team_id,deleted_at)')
        .eq('status', 'pending')
        .eq('sessions.team_id', prefs.team_id)
        .is('sessions.deleted_at', null)
        .order('scheduled_at', { ascending: true })
        .limit(50),
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

    type RawUpcoming = {
      id: number;
      scheduled_at: string;
      channel: 'whatsapp' | 'sms';
      group_filter: string | null;
      player_ids_json: number[] | null;
      session_id: number;
      sessions: { label: string; type: SessionType };
    };
    setUpcoming(((pendingSends ?? []) as unknown as RawUpcoming[]).map((s) => ({
      id: s.id,
      scheduled_at: s.scheduled_at,
      channel: s.channel,
      group_filter: s.group_filter,
      player_ids_json: s.player_ids_json,
      session_id: s.session_id,
      session_label: s.sessions.label,
      session_type: s.sessions.type,
    })));

    setLoading(false);
  }, [sb, prefs.team_id]);

  async function cancelSend(sendId: number) {
    if (!confirm('Cancel this send? It will not go out at the scheduled time.')) return;
    const res = await fetch(`/api/scheduled-sends/${sendId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cancel: true }),
    });
    if (res.ok) await load();
  }

  useEffect(() => { load(); }, [load]);

  // Open: seed sensible defaults so the coach has one keystroke to commit.
  useEffect(() => {
    if (!open) return;
    const when = defaultScheduledFor();
    setFormType('practice');
    setFormTemplateId('');
    setFormChannel('whatsapp');
    setFormScheduledAt(when);
    setFormLabel(autoLabel('practice', when));
    setLabelEdited(false);
    setErrMsg(null);
  }, [open]);

  // Type or scheduled-for changes: refresh the prefilled label until the
  // coach hand-edits it.
  useEffect(() => {
    if (!open || labelEdited) return;
    setFormLabel(autoLabel(formType, formScheduledAt));
  }, [formType, formScheduledAt, open, labelEdited]);

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
    const scheduledIso = formScheduledAt.toISOString();
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: formType,
        label: formLabel,
        template_id: formTemplateId ? Number(formTemplateId) : null,
        scheduled_at: scheduledIso,
        channel: formChannel,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
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
        subtitle={`${stats.total} session${stats.total === 1 ? '' : 's'} — ${stats.practice} practice · ${stats.match} competition · ${stats.lifting} lifting`}
        actions={
          canCreate ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">New session</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create a session</DialogTitle></DialogHeader>
                <div className="grid gap-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <label className="text-[12.5px] font-semibold" htmlFor="type">Type</label>
                      <Select value={formType} onValueChange={(v) => setFormType(v as SessionType)}>
                        <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="practice">Practice</SelectItem>
                          <SelectItem value="match">Competition</SelectItem>
                          <SelectItem value="lifting">Lifting</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-[12.5px] font-semibold" htmlFor="channel">Channel</label>
                      <Select value={formChannel} onValueChange={(v) => setFormChannel(v as 'whatsapp' | 'sms')}>
                        <SelectTrigger id="channel"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[12.5px] font-semibold" htmlFor="sched">Send the survey at</label>
                    <DateTimePicker
                      value={formScheduledAt}
                      onChange={setFormScheduledAt}
                      minDate={new Date()}
                    />
                    <p className="text-[11.5px] text-[color:var(--ink-mute)]">
                      The label below auto-fills from this time and the type — just hit Create.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[12.5px] font-semibold" htmlFor="label">Label</label>
                    <Input
                      id="label"
                      value={formLabel}
                      onChange={(e) => { setFormLabel(e.target.value); setLabelEdited(true); }}
                      placeholder="e.g. Tue AM practice, Sat — Competition"
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
                      Send is queued in shadow mode — no actual texts go out until cutover.
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
        {upcoming.length > 0 && (
          <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <header
              className="flex items-center justify-between gap-3 px-6 py-3 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-[color:var(--blue)]" />
                <h2 className="text-[13px] font-bold text-[color:var(--ink)]">Upcoming sends</h2>
              </div>
              <span className="text-[11.5px] text-[color:var(--ink-mute)]">
                {upcoming.length} queued · shadow mode
              </span>
            </header>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {upcoming.map((s) => {
                const audience = s.player_ids_json && s.player_ids_json.length > 0
                  ? `${s.player_ids_json.length} athlete${s.player_ids_json.length === 1 ? '' : 's'}`
                  : s.group_filter
                    ? `group: ${s.group_filter}`
                    : 'whole team';
                return (
                  <li key={s.id} className="px-6 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/sessions/${s.session_id}`}
                          className="text-[13.5px] font-semibold text-[color:var(--ink)] hover:underline truncate"
                        >
                          {s.session_label}
                        </Link>
                        <Pill tone={TYPE_TONE[s.session_type]}>{TYPE_LABEL[s.session_type]}</Pill>
                      </div>
                      <p
                        className="mt-0.5 mono text-[11.5px] tabular text-[color:var(--ink-mute)]"
                        title={prettyDateTime(s.scheduled_at)}
                      >
                        {relativeTime(s.scheduled_at)} · {s.channel} · {audience}
                      </p>
                    </div>
                    {canCreate && (
                      <button
                        type="button"
                        onClick={() => cancelSend(s.id)}
                        className="rounded p-1.5 text-[color:var(--ink-mute)] hover:bg-[color:var(--paper-2)] hover:text-[color:var(--red)]"
                        aria-label="Cancel scheduled send"
                        title="Cancel scheduled send"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

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
                <SelectItem value="match">Competition</SelectItem>
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
                          <Pill tone={TYPE_TONE[s.type]}>{TYPE_LABEL[s.type]}</Pill>
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
