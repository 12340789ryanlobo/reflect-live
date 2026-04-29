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

  // Per-question summary stats. Shape varies by question type because
  // a single 'avg' field doesn't read well for binary (avg 0.3 means
  // "30% yes") or 1-3 choice (avg 1.7 hides the distribution). Each
  // type builds the summary it actually wants to display in the header.
  const questionStats = useMemo(() => {
    const out = new Map<string, QuestionStats>();
    for (const q of questions) {
      const answers = responses.filter((r) => r.question_id === q.id);
      out.set(q.id, computeQuestionStats(q, answers));
    }
    return out;
  }, [questions, responses]);

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
        {/* Compact stats ribbon — replaces the four-stat-card grid. The
            same numbers in one row keeps the page scannable when the
            session has 30+ athletes and the matrix below already takes
            most of the screen. */}
        <section
          className="rounded-2xl bg-[color:var(--card)] border px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <StatChip label="sent" value={deliveries.length} tone="ink" />
          <StatChip label="completed" value={completed} tone="green" />
          <StatChip label="in progress" value={inProgress} tone="blue" />
          <StatChip label="pending" value={pending} tone="mute" />
          {questions.length > 0 && (
            <StatChip label="questions" value={questions.length} tone="ink" />
          )}
          {flags.length > 0 && (
            <StatChip label="flags" value={flags.length} tone="red" />
          )}
        </section>

        {/* Per-question insight blocks. One block per question. The
            block surfaces just the actionable bit: outlier athletes for
            numeric, yes-sayers for binary, the actual replies for free
            text. No matrix, no spreadsheet feel. */}
        {questions.length === 0 ? (
          <section
            className="rounded-2xl bg-[color:var(--card)] border px-6 py-8"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="text-[13px] text-[color:var(--ink-mute)]">
              No questions captured yet — the snapshot is created the first time the survey runs.
            </p>
          </section>
        ) : (
          <QuestionInsights
            questions={questions}
            deliveries={deliveries}
            responses={responses}
            questionStats={questionStats}
          />
        )}

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

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ink' | 'green' | 'blue' | 'mute' | 'red';
}) {
  const color =
    tone === 'green' ? 'var(--green)' :
    tone === 'blue' ? 'var(--blue)' :
    tone === 'mute' ? 'var(--ink-mute)' :
    tone === 'red' ? 'var(--red)' :
    'var(--ink)';
  return (
    <div className="inline-flex items-baseline gap-1.5">
      <span className="mono text-[20px] font-bold tabular" style={{ color }}>{value}</span>
      <span className="text-[11px] uppercase tracking-wide font-semibold text-[color:var(--ink-mute)]">{label}</span>
    </div>
  );
}

// ---------------- QuestionInsights ------------------------------------------
//
// One block per question, rendered top-to-bottom. Surfaces just the
// actionable signal — outliers for numeric, yes-sayers for binary,
// the actual replies for free text. No matrix, no spreadsheet view;
// reads as a coach's-eye summary of what the team said.

interface InsightsProps {
  questions: SurveyQuestion[];
  deliveries: DeliveryRow[];
  responses: ResponseRow[];
  questionStats: Map<string, QuestionStats>;
}

// Per-question summary, shape per type. The header renderer
// (QuestionSummary) consumes this — keeps the matrix code branch-free.
type QuestionStats =
  | { kind: 'numeric';      count: number; mean: number; min: number; max: number; highIsBad: boolean }
  | { kind: 'binary';       count: number; yes: number }
  | { kind: 'choice_1_3';   count: number; buckets: [number, number, number] }
  | { kind: 'text';         count: number }
  | { kind: 'empty' };

function computeQuestionStats(q: SurveyQuestion, answers: ResponseRow[]): QuestionStats {
  if (answers.length === 0) return { kind: 'empty' };
  const flag = q.flag_rule;
  const highIsBad =
    flag?.condition === 'value >= 7' ||
    flag?.condition === 'any_rating >= 7' ||
    flag?.condition === 'value == 1';

  if (q.type === 'scale_1_10' || q.type === 'captain_rating') {
    const nums = answers.map((a) => a.answer_num).filter((n): n is number => n !== null);
    if (nums.length === 0) return { kind: 'text', count: answers.length };
    const sum = nums.reduce((a, b) => a + b, 0);
    return {
      kind: 'numeric',
      count: answers.length,
      mean: sum / nums.length,
      min: q.validation?.min ?? 1,
      max: q.validation?.max ?? 10,
      highIsBad,
    };
  }
  if (q.type === 'binary') {
    let yes = 0;
    for (const a of answers) if (a.answer_num === 1) yes += 1;
    return { kind: 'binary', count: answers.length, yes };
  }
  if (q.type === 'choice_1_3') {
    const buckets: [number, number, number] = [0, 0, 0];
    for (const a of answers) {
      if (a.answer_num === 1) buckets[0] += 1;
      else if (a.answer_num === 2) buckets[1] += 1;
      else if (a.answer_num === 3) buckets[2] += 1;
    }
    return { kind: 'choice_1_3', count: answers.length, buckets };
  }
  return { kind: 'text', count: answers.length };
}

// Short tags for each question type — same vocabulary as the templates editor.
const QUESTION_TYPE_LABEL: Record<SurveyQuestion['type'], string> = {
  scale_1_10: '1-10 scale',
  binary: 'yes / no',
  choice_1_3: '1-3 choice',
  captain_rating: 'captain rating',
  multi_select_body_regions: 'body regions',
  free_text: 'free text',
};

const FREE_TEXT_PREVIEW_LIMIT = 5;

interface AthleteAnswer {
  player_id: number;
  player_name: string;
  answer: ResponseRow;
}

function QuestionInsights({ questions, deliveries, responses, questionStats }: InsightsProps) {
  // Build playerId → name map once for inline athlete chips.
  const nameByPid = new Map<number, string>();
  for (const d of deliveries) {
    if (d.player) nameByPid.set(d.player_id, d.player.name);
  }

  // Bucket responses by question.
  const respByQ = new Map<string, AthleteAnswer[]>();
  for (const r of responses) {
    const list = respByQ.get(r.question_id) ?? [];
    list.push({
      player_id: r.player_id,
      player_name: nameByPid.get(r.player_id) ?? '—',
      answer: r,
    });
    respByQ.set(r.question_id, list);
  }

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
      <header
        className="flex items-center justify-between gap-3 px-6 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-bold text-[color:var(--ink)]">Responses</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">
          {questions.length} question{questions.length === 1 ? '' : 's'}
        </span>
      </header>
      <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {questions.map((q) => {
          const stats = questionStats.get(q.id) ?? { kind: 'empty' as const };
          const list = respByQ.get(q.id) ?? [];
          return (
            <li key={q.id}>
              <QuestionInsight q={q} stats={stats} answers={list} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function QuestionInsight({
  q,
  stats,
  answers,
}: {
  q: SurveyQuestion;
  stats: QuestionStats;
  answers: AthleteAnswer[];
}) {
  return (
    <div className="px-6 py-4">
      {/* Header row — Q-number, question text, modifiers */}
      <div className="flex items-baseline gap-3">
        <span className="mono text-[11px] font-bold tabular text-[color:var(--ink-mute)] shrink-0 w-6">
          Q{q.order}
        </span>
        <p className="text-[14px] font-semibold text-[color:var(--ink)] leading-snug">
          {q.text}
          {(q.captain_only || q.conditional) && (
            <span className="ml-2 text-[11px] font-normal text-[color:var(--ink-mute)]">
              {q.captain_only && '· captain only '}
              {q.conditional && `· shows when ${q.conditional.depends_on} = ${q.conditional.show_if}`}
            </span>
          )}
        </p>
      </div>
      {/* Type + summary row */}
      <div className="mt-1.5 ml-9 flex items-center gap-3 text-[11.5px] text-[color:var(--ink-mute)]">
        <span className="uppercase tracking-wide">{QUESTION_TYPE_LABEL[q.type] ?? q.type}</span>
        <SummaryBar stats={stats} />
      </div>
      {/* Highlight row — outliers, yes-sayers, free-text replies */}
      <div className="mt-2 ml-9">
        <Highlight q={q} stats={stats} answers={answers} />
      </div>
    </div>
  );
}

/**
 * Compact summary bar — a single line that shows the team-level
 * aggregate for the question. Shape varies per question type so the
 * label always matches the answer space (avg out-of-N for scales,
 * percent yes for binary, distribution for 1-3 choice, count for text).
 */
function SummaryBar({ stats }: { stats: QuestionStats }) {
  if (stats.kind === 'empty') {
    return <span className="text-[color:var(--ink-mute)]">no replies yet</span>;
  }
  if (stats.kind === 'numeric') {
    const ratio = (stats.mean - stats.min) / (stats.max - stats.min);
    const tone =
      ratio <= 0.3 ? (stats.highIsBad ? 'var(--green)' : 'var(--red)')
      : ratio >= 0.7 ? (stats.highIsBad ? 'var(--red)' : 'var(--green)')
      : 'var(--amber)';
    return (
      <span className="inline-flex items-center gap-2">
        <span className="mono tabular text-[color:var(--ink-soft)]">
          avg {stats.mean.toFixed(1)} / {stats.max}
        </span>
        <span className="inline-block h-[3px] w-[60px] rounded-full bg-[color:var(--paper-2)] overflow-hidden">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%`, background: tone }}
          />
        </span>
        <span>· {stats.count} repl{stats.count === 1 ? 'y' : 'ies'}</span>
      </span>
    );
  }
  if (stats.kind === 'binary') {
    const pct = stats.count === 0 ? 0 : Math.round((stats.yes / stats.count) * 100);
    return (
      <span className="inline-flex items-center gap-2">
        <span className="mono tabular text-[color:var(--ink-soft)]">
          {pct}% yes ({stats.yes}/{stats.count})
        </span>
        <span className="inline-block h-[3px] w-[60px] rounded-full bg-[color:var(--paper-2)] overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--red)' }} />
        </span>
      </span>
    );
  }
  if (stats.kind === 'choice_1_3') {
    const total = stats.count || 1;
    const [light, right, heavy] = stats.buckets;
    return (
      <span className="inline-flex items-center gap-2">
        <span className="mono tabular text-[color:var(--ink-soft)]">
          light {light} · right {right} · heavy {heavy}
        </span>
        <span className="inline-flex h-[3px] w-[60px] overflow-hidden rounded-full bg-[color:var(--paper-2)]">
          <span style={{ width: `${(light / total) * 100}%`, background: 'var(--green)' }} />
          <span style={{ width: `${(right / total) * 100}%`, background: 'var(--ink-mute)' }} />
          <span style={{ width: `${(heavy / total) * 100}%`, background: 'var(--amber)' }} />
        </span>
      </span>
    );
  }
  return (
    <span className="mono tabular text-[color:var(--ink-soft)]">
      {stats.count} repl{stats.count === 1 ? 'y' : 'ies'}
    </span>
  );
}

/**
 * The 'actionable' line under each question. What gets surfaced varies
 * with the question's intent:
 *
 *   numeric (1-10)         → outliers in the bad zone (≤ 3 normally,
 *                            ≥ 7 when the flag rule says high-is-bad).
 *                            Listed lowest-first as inline chips.
 *   binary (yes/no)        → who said yes (the concerning answer).
 *                            Listed alphabetically.
 *   choice_1_3             → who said heavy (3) — the concerning bucket.
 *   captain_rating         → outliers like numeric.
 *   free_text / regions    → the actual replies, athlete: "answer". When
 *                            there are too many to show inline, render
 *                            the first FREE_TEXT_PREVIEW_LIMIT and an
 *                            'expand' button that swaps to the full list.
 *
 * If no athletes hit the actionable bucket (e.g. nobody said yes, all
 * scores are healthy), we render a single muted 'all clear' line so the
 * row still anchors visually.
 */
function Highlight({
  q,
  stats,
  answers,
}: {
  q: SurveyQuestion;
  stats: QuestionStats;
  answers: AthleteAnswer[];
}) {
  if (stats.kind === 'empty' || answers.length === 0) {
    return <p className="text-[12px] text-[color:var(--ink-mute)] italic">No replies on record.</p>;
  }

  if (q.type === 'scale_1_10' || q.type === 'captain_rating') {
    const highIsBad =
      q.flag_rule?.condition === 'value >= 7' ||
      q.flag_rule?.condition === 'any_rating >= 7';
    const outliers = answers
      .filter((a) => a.answer.answer_num !== null)
      .filter((a) => highIsBad
        ? (a.answer.answer_num as number) >= 7
        : (a.answer.answer_num as number) <= 3,
      )
      .sort((a, b) => highIsBad
        ? (b.answer.answer_num as number) - (a.answer.answer_num as number)
        : (a.answer.answer_num as number) - (b.answer.answer_num as number),
      );
    if (outliers.length === 0) {
      return (
        <p className="text-[12px] text-[color:var(--ink-mute)]">
          {highIsBad ? 'No high-pain reports.' : 'No one in the low zone.'}
        </p>
      );
    }
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11.5px] uppercase tracking-wide text-[color:var(--ink-mute)] mr-1">
          {highIsBad ? 'High' : 'Low'}
        </span>
        {outliers.map((a) => (
          <Link
            key={a.answer.id}
            href={`/dashboard/player/${a.player_id}`}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] hover:underline"
            style={{
              background: highIsBad ? 'var(--red-soft)' : 'var(--red-soft)',
              color: 'var(--ink)',
            }}
          >
            <span className="font-semibold">{a.player_name}</span>
            <span className="mono tabular text-[color:var(--ink-soft)]">{a.answer.answer_num}</span>
          </Link>
        ))}
      </div>
    );
  }

  if (q.type === 'binary') {
    const yesList = answers
      .filter((a) => a.answer.answer_num === 1)
      .sort((a, b) => a.player_name.localeCompare(b.player_name));
    if (yesList.length === 0) {
      return <p className="text-[12px] text-[color:var(--ink-mute)]">Everyone replied no.</p>;
    }
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11.5px] uppercase tracking-wide text-[color:var(--ink-mute)] mr-1">Yes</span>
        {yesList.map((a) => (
          <Link
            key={a.answer.id}
            href={`/dashboard/player/${a.player_id}`}
            className="rounded px-1.5 py-0.5 text-[12px] font-semibold hover:underline"
            style={{ background: 'var(--red-soft)', color: 'var(--ink)' }}
          >
            {a.player_name}
          </Link>
        ))}
      </div>
    );
  }

  if (q.type === 'choice_1_3') {
    const heavyList = answers
      .filter((a) => a.answer.answer_num === 3)
      .sort((a, b) => a.player_name.localeCompare(b.player_name));
    if (heavyList.length === 0) {
      return <p className="text-[12px] text-[color:var(--ink-mute)]">No 'too heavy' replies.</p>;
    }
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11.5px] uppercase tracking-wide text-[color:var(--ink-mute)] mr-1">Too heavy</span>
        {heavyList.map((a) => (
          <Link
            key={a.answer.id}
            href={`/dashboard/player/${a.player_id}`}
            className="rounded px-1.5 py-0.5 text-[12px] font-semibold hover:underline"
            style={{ background: 'var(--amber-soft)', color: 'var(--ink)' }}
          >
            {a.player_name}
          </Link>
        ))}
      </div>
    );
  }

  // free_text and multi_select_body_regions — show the actual replies.
  return <FreeTextReplies q={q} answers={answers} />;
}

function FreeTextReplies({ q, answers }: { q: SurveyQuestion; answers: AthleteAnswer[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...answers].sort((a, b) => a.player_name.localeCompare(b.player_name));
  const visible = expanded ? sorted : sorted.slice(0, FREE_TEXT_PREVIEW_LIMIT);
  const hidden = sorted.length - visible.length;

  return (
    <ul className="space-y-1">
      {visible.map((a) => (
        <li key={a.answer.id} className="flex items-baseline gap-2 text-[12.5px]">
          <Link
            href={`/dashboard/player/${a.player_id}`}
            className="font-semibold text-[color:var(--ink)] hover:underline whitespace-nowrap"
          >
            {a.player_name}
          </Link>
          <span className="text-[color:var(--ink-mute)]">·</span>
          <span className="text-[color:var(--ink-soft)] whitespace-pre-wrap break-words">
            {a.answer.answer_raw}
          </span>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[11.5px] font-semibold text-[color:var(--blue)] hover:underline"
            aria-label={`Show ${hidden} more replies for question ${q.order}`}
          >
            Show {hidden} more reply{hidden === 1 ? '' : 's'}
          </button>
        </li>
      )}
    </ul>
  );
}
