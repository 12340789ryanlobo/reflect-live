'use client';

// Session detail — frozen question snapshot, per-question response stats,
// per-player response table, flag list. Coaches/admins can rename the
// label and edit video links inline.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from '@/components/v3/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Pencil, Save, X } from 'lucide-react';
import { prettyDateTime, relativeTime } from '@/lib/format';
import type { SessionMetadata, SessionType, SurveyQuestion } from '@reflect-live/shared';

interface SessionRow {
  id: number;
  team_id: number;
  type: SessionType;
  label: string;
  template_id: number | null;
  metadata_json: SessionMetadata | null;
  video_links_json: { label: string; url: string }[] | null;
  created_at: string;
}

interface DeliveryRow {
  id: number;
  player_id: number;
  status: 'pending' | 'in_progress' | 'completed' | 'abandoned';
  started_at: string | null;
  completed_at: string | null;
  current_q_idx: number;
  player: { name: string; group: string | null } | null;
}

interface ResponseRow {
  id: number;
  player_id: number;
  question_id: string;
  answer_raw: string;
  answer_num: number | null;
  created_at: string;
}

interface FlagRow {
  id: number;
  player_id: number;
  flag_type: string;
  severity: 'low' | 'medium' | 'high';
  details: string | null;
  created_at: string;
  player: { name: string } | null;
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

const STATUS_TONE: Record<DeliveryRow['status'], 'mute' | 'blue' | 'green' | 'red'> = {
  pending: 'mute',
  in_progress: 'blue',
  completed: 'green',
  abandoned: 'red',
};

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);
  const { prefs, role } = useDashboard();
  const sb = useSupabase();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const canEdit = role === 'coach' || role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: ds }, { data: rs }, { data: fs }] = await Promise.all([
      sb.from('sessions')
        .select('id,team_id,type,label,template_id,metadata_json,video_links_json,created_at')
        .eq('id', sessionId)
        .eq('team_id', prefs.team_id)
        .maybeSingle(),
      sb.from('deliveries')
        .select('id,player_id,status,started_at,completed_at,current_q_idx,player:players(name,group)')
        .eq('session_id', sessionId),
      sb.from('responses')
        .select('id,player_id,question_id,answer_raw,answer_num,created_at')
        .eq('session_id', sessionId),
      sb.from('flags')
        .select('id,player_id,flag_type,severity,details,created_at,player:players(name)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false }),
    ]);
    setSession((s as SessionRow | null) ?? null);
    setDeliveries((ds ?? []) as unknown as DeliveryRow[]);
    setResponses((rs ?? []) as ResponseRow[]);
    setFlags((fs ?? []) as unknown as FlagRow[]);
    setLoading(false);
  }, [sb, sessionId, prefs.team_id]);

  useEffect(() => { if (Number.isInteger(sessionId)) load(); }, [load, sessionId]);

  async function saveLabel() {
    if (!session) return;
    const label = labelDraft.trim();
    if (!label || label === session.label) { setRenaming(false); return; }
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      setRenaming(false);
      await load();
    }
  }

  const questions: SurveyQuestion[] = useMemo(
    () => session?.metadata_json?.question_snapshot?.questions ?? [],
    [session],
  );

  // Per-question stats: count of answers + numeric mean for scale-style types.
  const questionStats = useMemo(() => {
    const out = new Map<string, { count: number; mean: number | null }>();
    for (const q of questions) {
      const answers = responses.filter((r) => r.question_id === q.id);
      const numeric = answers
        .map((a) => a.answer_num)
        .filter((n): n is number => n !== null);
      const mean = numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null;
      out.set(q.id, { count: answers.length, mean });
    }
    return out;
  }, [questions, responses]);

  // Per-player view: each delivery and the answers they gave.
  const playerView = useMemo(() => {
    const byPlayer = new Map<number, { delivery: DeliveryRow; answers: ResponseRow[] }>();
    for (const d of deliveries) {
      byPlayer.set(d.player_id, { delivery: d, answers: [] });
    }
    for (const r of responses) {
      const entry = byPlayer.get(r.player_id);
      if (entry) entry.answers.push(r);
    }
    return Array.from(byPlayer.values()).sort((a, b) =>
      (a.delivery.player?.name ?? '').localeCompare(b.delivery.player?.name ?? ''),
    );
  }, [deliveries, responses]);

  if (loading) {
    return (
      <main className="px-6 py-10 text-[13px] text-[color:var(--ink-mute)]">— loading —</main>
    );
  }
  if (!session) {
    return (
      <main className="px-6 py-12 text-center">
        <h1 className="text-2xl font-bold text-[color:var(--ink)]">Session not found</h1>
        <p className="mt-2 text-[13px] text-[color:var(--ink-mute)]">
          It may have been deleted, or you don&rsquo;t have access.
        </p>
        <Link href="/dashboard/sessions" className="mt-4 inline-block text-[13px] text-[color:var(--blue)] hover:underline">
          ← Back to sessions
        </Link>
      </main>
    );
  }

  const completed = deliveries.filter((d) => d.status === 'completed').length;
  const inProgress = deliveries.filter((d) => d.status === 'in_progress').length;
  const pending = deliveries.filter((d) => d.status === 'pending').length;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/dashboard/sessions" className="inline-flex items-center gap-1 hover:text-[color:var(--ink)]">
            <ChevronLeft className="size-3" /> Back to sessions
          </Link>
        }
        title={
          renaming ? (
            <span className="inline-flex items-center gap-2">
              <Input
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                className="text-2xl h-10"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setRenaming(false); }}
              />
              <Button size="sm" variant="ghost" onClick={saveLabel} aria-label="Save"><Save className="size-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)} aria-label="Cancel"><X className="size-4" /></Button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              {session.label}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { setLabelDraft(session.label); setRenaming(true); }}
                  className="text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]"
                  aria-label="Rename"
                >
                  <Pencil className="size-4" />
                </button>
              )}
            </span>
          )
        }
        subtitle={
          <span className="inline-flex items-center gap-2">
            <Pill tone={TYPE_TONE[session.type]}>{TYPE_LABEL[session.type]}</Pill>
            <span>created {relativeTime(session.created_at)}</span>
            {questions.length > 0 && <span>· {questions.length} question{questions.length === 1 ? '' : 's'}</span>}
          </span>
        }
      />

      <main className="px-6 pb-12 pt-4 space-y-6">
        {/* Stats row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Sent" value={deliveries.length} tone="ink" />
          <StatCard label="Completed" value={completed} tone="green" />
          <StatCard label="In progress" value={inProgress} tone="blue" />
          <StatCard label="Pending" value={pending} tone="mute" />
        </section>

        {/* Question snapshot + stats */}
        <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Question snapshot</h2>
            <span className="text-[11.5px] text-[color:var(--ink-mute)]">
              {session.metadata_json?.question_snapshot?.source ?? '—'}
              {session.metadata_json?.question_snapshot?.captured_at &&
                ` · frozen ${relativeTime(session.metadata_json.question_snapshot.captured_at)}`}
            </span>
          </header>
          {questions.length === 0 ? (
            <p className="px-6 py-8 text-[13px] text-[color:var(--ink-mute)]">
              No questions captured yet — the snapshot is created the first time the survey runs.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {questions.map((q) => {
                const stats = questionStats.get(q.id) ?? { count: 0, mean: null };
                return (
                  <li key={q.id} className="px-6 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[color:var(--ink)]">
                          <span className="mono text-[color:var(--ink-mute)] mr-2">#{q.order}</span>
                          {q.text}
                        </p>
                        <p className="mt-1 text-[11.5px] text-[color:var(--ink-mute)]">
                          {q.type}{q.captain_only ? ' · captain only' : ''}
                          {q.conditional && ` · shows when ${q.conditional.depends_on} ${q.conditional.show_if}`}
                          {q.flag_rule && ` · flags ${q.flag_rule.flag_type} when ${q.flag_rule.condition}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="mono text-[14px] font-bold tabular text-[color:var(--ink)]">
                          {stats.count}
                        </p>
                        {stats.mean !== null && (
                          <p className="text-[11px] text-[color:var(--ink-mute)] mono tabular">
                            avg {stats.mean.toFixed(1)}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Per-player responses */}
        <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Responses by athlete</h2>
            <span className="text-[11.5px] text-[color:var(--ink-mute)]">{playerView.length}</span>
          </header>
          {playerView.length === 0 ? (
            <p className="px-6 py-8 text-[13px] text-[color:var(--ink-mute)]">
              No deliveries yet — once the worker schedules + sends, athletes will appear here.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {playerView.map(({ delivery, answers }) => (
                <li key={delivery.id} className="px-6 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/player/${delivery.player_id}`}
                          className="text-[14px] font-semibold text-[color:var(--ink)] hover:underline"
                        >
                          {delivery.player?.name ?? '—'}
                        </Link>
                        <Pill tone={STATUS_TONE[delivery.status]}>{delivery.status.replace('_', ' ')}</Pill>
                      </div>
                      {answers.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {answers.map((a) => {
                            const q = questions.find((x) => x.id === a.question_id);
                            return (
                              <li key={a.id} className="text-[12.5px] text-[color:var(--ink-soft)]">
                                <span className="text-[color:var(--ink-mute)]">{q?.text ?? a.question_id}</span>
                                {' → '}
                                <span className="font-semibold text-[color:var(--ink)]">{a.answer_raw}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    <div className="text-right shrink-0 mono text-[11px] tabular text-[color:var(--ink-mute)]">
                      {delivery.completed_at
                        ? `done ${relativeTime(delivery.completed_at)}`
                        : delivery.started_at
                          ? `started ${relativeTime(delivery.started_at)}`
                          : 'not started'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Flags */}
        {flags.length > 0 && (
          <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Flags raised</h2>
              <span className="text-[11.5px] text-[color:var(--ink-mute)]">{flags.length}</span>
            </header>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {flags.map((f) => (
                <li key={f.id} className="px-6 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/player/${f.player_id}`}
                          className="text-[14px] font-semibold text-[color:var(--ink)] hover:underline"
                        >
                          {f.player?.name ?? '—'}
                        </Link>
                        <Pill tone={f.severity === 'high' ? 'red' : f.severity === 'medium' ? 'amber' : 'mute'}>
                          {f.flag_type.replace('_', ' ')} · {f.severity}
                        </Pill>
                      </div>
                      {f.details && (
                        <p className="mt-1 text-[12.5px] text-[color:var(--ink-soft)]">{f.details}</p>
                      )}
                    </div>
                    <span className="mono text-[11px] tabular text-[color:var(--ink-mute)]" title={prettyDateTime(f.created_at)}>
                      {relativeTime(f.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Video links */}
        {Array.isArray(session.video_links_json) && session.video_links_json.length > 0 && (
          <section className="rounded-2xl bg-[color:var(--card)] border p-5" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)] mb-3">Video links</h2>
            <ul className="space-y-1.5">
              {session.video_links_json.map((v, i) => (
                <li key={i}>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] text-[color:var(--blue)] hover:underline"
                  >
                    {v.label || v.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ink' | 'green' | 'blue' | 'mute';
}) {
  const color =
    tone === 'green' ? 'var(--green)' :
    tone === 'blue' ? 'var(--blue)' :
    tone === 'mute' ? 'var(--ink-mute)' :
    'var(--ink)';
  return (
    <div className="rounded-2xl bg-[color:var(--card)] border px-5 py-4" style={{ borderColor: 'var(--border)' }}>
      <p className="text-[10.5px] uppercase tracking-wide font-semibold text-[color:var(--ink-mute)]">{label}</p>
      <p className="mt-1 mono text-[28px] font-bold tabular" style={{ color }}>{value}</p>
    </div>
  );
}
