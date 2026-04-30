'use client';

// Session detail — frozen question snapshot, per-question response stats,
// per-player response table, flag list. Coaches/admins can rename the
// label and edit video links inline.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { HoverCard as HoverCardPrimitive, Popover as PopoverPrimitive } from 'radix-ui';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from '@/components/v3/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, MessageSquareText, Pencil, Save, X } from 'lucide-react';
import { prettyDateTime, relativeTime } from '@/lib/format';
import type { SessionMetadata, SessionType, SurveyQuestion } from '@reflect-live/shared';

// Truncation budget for free-text answers in matrix cells. Tuned to fit
// comfortably inside the fixed Q-column width (96px) — anything longer
// renders as `<head>…` with a click-to-expand popover for the full text.
const CELL_TEXT_LIMIT = 10;

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

        {/* Single matrix card. Question reference (numbered list with
            summary) sits at the TOP of the card — coach reads it once,
            then scans the dense heatmap below. No second card, no
            popover dance just to find what Q1 asks. */}
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
          <ResponseMatrix
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
                          href={`/dashboard/players/${f.player_id}`}
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

// ---------------- ResponseMatrix --------------------------------------------
//
// Athlete-as-row, question-as-column heatmap. Question reference list
// sits at the TOP of the same card so a coach reads what each Q is
// asking before scanning the cells. Matrix uses tight 64px columns and
// just 'Q1', 'Q2' labels — the top-of-card list does the heavy lifting
// for question identity.

interface MatrixProps {
  questions: SurveyQuestion[];
  deliveries: DeliveryRow[];
  responses: ResponseRow[];
  questionStats: Map<string, QuestionStats>;
}

/**
 * Color logic for matrix cells. Heuristic:
 *   - scale_1_10 / captain_rating: 1-3 red-soft, 4-6 amber-soft, 7-10 green-soft
 *     (high is "good" by default; questions where high is bad — pain — flip)
 *   - binary: 1 → red-soft (yes-pain pattern matches reflect's flag rules),
 *             0 → green-soft
 *   - choice_1_3: 1 green-soft, 2 neutral, 3 amber-soft (light/right/heavy)
 *   - free_text / multi_select_body_regions: neutral fill, content shown
 */
function cellTone(question: SurveyQuestion, answer: ResponseRow): { bg: string; text: string } {
  const v = answer.answer_num;
  const flag = question.flag_rule;
  const highIsBad =
    flag?.condition === 'value >= 7' ||
    flag?.condition === 'any_rating >= 7' ||
    flag?.condition === 'value == 1';

  if (question.type === 'scale_1_10' || question.type === 'captain_rating') {
    if (v === null) return { bg: 'var(--paper-2)', text: 'var(--ink-mute)' };
    const lowGood = highIsBad;
    const goodSoft = 'var(--green-soft)';
    const badSoft = 'var(--red-soft)';
    const midSoft = 'var(--amber-soft)';
    if (v <= 3) return { bg: lowGood ? goodSoft : badSoft, text: 'var(--ink)' };
    if (v <= 6) return { bg: midSoft, text: 'var(--ink)' };
    return { bg: lowGood ? badSoft : goodSoft, text: 'var(--ink)' };
  }
  if (question.type === 'binary') {
    if (v === 1) return { bg: 'var(--red-soft)', text: 'var(--ink)' };
    if (v === 0) return { bg: 'var(--green-soft)', text: 'var(--ink)' };
  }
  if (question.type === 'choice_1_3') {
    if (v === 1) return { bg: 'var(--green-soft)', text: 'var(--ink)' };
    if (v === 2) return { bg: 'var(--paper-2)', text: 'var(--ink)' };
    if (v === 3) return { bg: 'var(--amber-soft)', text: 'var(--ink)' };
  }
  return { bg: 'var(--paper-2)', text: 'var(--ink)' };
}

interface DisplayedAnswer {
  text: string;
  truncated: boolean;
}

function shortAnswer(question: SurveyQuestion, answer: ResponseRow): DisplayedAnswer {
  if (question.type === 'binary') {
    if (answer.answer_num === 1) return { text: 'yes', truncated: false };
    if (answer.answer_num === 0) return { text: 'no', truncated: false };
  }
  if (answer.answer_num !== null && (
    question.type === 'scale_1_10' ||
    question.type === 'choice_1_3' ||
    question.type === 'captain_rating'
  )) {
    const raw = (answer.answer_raw ?? '').trim();
    const truncated = question.type === 'captain_rating'
      && raw.length > String(answer.answer_num).length;
    return { text: String(answer.answer_num), truncated };
  }
  const t = answer.answer_raw ?? '';
  if (t.length > CELL_TEXT_LIMIT) {
    return { text: `${t.slice(0, CELL_TEXT_LIMIT - 1)}…`, truncated: true };
  }
  return { text: t, truncated: false };
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

function ResponseMatrix({ questions, deliveries, responses, questionStats }: MatrixProps) {
  // Build the (player_id × question_id → response) lookup once.
  const byPlayerQ = new Map<number, Map<string, ResponseRow>>();
  for (const r of responses) {
    let m = byPlayerQ.get(r.player_id);
    if (!m) { m = new Map(); byPlayerQ.set(r.player_id, m); }
    m.set(r.question_id, r);
  }
  const rows = [...deliveries].sort((a, b) =>
    (a.player?.name ?? '').localeCompare(b.player?.name ?? ''),
  );

  return (
    <section
      className="rounded-2xl bg-[color:var(--card)] border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      <header
        className="flex items-center justify-between gap-3 px-6 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-bold text-[color:var(--ink)]">Responses</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">
          {rows.length} athlete{rows.length === 1 ? '' : 's'} · {questions.length} question{questions.length === 1 ? '' : 's'}
        </span>
      </header>

      <div className="overflow-x-auto">
        {/* table-fixed + uniform Q-column width gives the grid a single
            visual rhythm — numeric, binary, and free-text columns all
            sit in 96px slots so the matrix reads as a clean grid
            instead of widths-by-content. */}
        <table className="w-full text-[12.5px] tabular border-separate border-spacing-0 table-fixed">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 bg-[color:var(--card)] text-left px-3 py-2 border-b w-[140px]"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="text-[10.5px] uppercase tracking-wide font-semibold text-[color:var(--ink-mute)]">
                  Athlete
                </span>
              </th>
              {questions.map((q) => {
                const stats = questionStats.get(q.id) ?? { kind: 'empty' as const };
                return (
                  <th
                    key={q.id}
                    className="text-center px-2 py-2 border-b w-[96px]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <QuestionHover q={q} stats={stats} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const answers = byPlayerQ.get(d.player_id) ?? new Map<string, ResponseRow>();
              return (
                <tr key={d.id} className="hover:bg-[color:var(--paper-2)]">
                  <td
                    className="sticky left-0 z-10 bg-[color:var(--card)] px-3 py-2 border-b align-middle w-[140px] max-w-[140px]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <Link
                      href={`/dashboard/players/${d.player_id}`}
                      title={d.player?.name ?? ''}
                      className="block text-[13px] font-semibold text-[color:var(--ink)] hover:underline truncate"
                    >
                      {d.player?.name ?? '—'}
                    </Link>
                  </td>
                  {questions.map((q) => {
                    const ans = answers.get(q.id);
                    if (!ans) {
                      return (
                        <td
                          key={q.id}
                          className="px-2 py-1.5 border-b text-center text-[color:var(--ink-mute)] w-[96px]"
                          style={{ borderColor: 'var(--border)' }}
                        >—</td>
                      );
                    }
                    return (
                      <td
                        key={q.id}
                        className="px-2 py-1.5 border-b text-center w-[96px]"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <AnswerCell
                          question={q}
                          answer={ans}
                          athleteName={d.player?.name ?? '—'}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Single matrix cell. Tinted span for short answers; click-to-expand
 * popover when the answer is truncated (long free-text or captain-rating
 * with a comment).
 */
function AnswerCell({
  question,
  answer,
  athleteName,
}: {
  question: SurveyQuestion;
  answer: ResponseRow;
  athleteName: string;
}) {
  const tone = cellTone(question, answer);
  const display = shortAnswer(question, answer);
  const trigger = (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-1 mono font-semibold whitespace-nowrap"
      style={{ background: tone.bg, color: tone.text }}
    >
      {display.text}
      {display.truncated && (
        <MessageSquareText className="size-3 opacity-60" aria-hidden />
      )}
    </span>
  );
  if (!display.truncated) return trigger;
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        className="cursor-pointer rounded transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--blue)]/40"
        aria-label={`Full answer from ${athleteName} for question ${question.order}`}
      >
        {trigger}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 max-w-[360px] rounded-2xl border bg-[color:var(--card)] p-4 shadow-lg"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-[10.5px] uppercase tracking-wide font-semibold text-[color:var(--ink-mute)]">
            {athleteName} · Q{question.order}
          </div>
          <p className="mt-1 text-[12px] text-[color:var(--ink-soft)] italic">{question.text}</p>
          <p className="mt-3 text-[13px] text-[color:var(--ink)] whitespace-pre-wrap break-words">
            {answer.answer_raw}
          </p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * Q-number column header. Looks like just 'Q1' / 'Q2' to keep columns
 * tight, but is a HoverCard trigger: hovering or focusing the cell pops
 * up a card with the full question text + type + any conditional/flag
 * rules + the type-aware team summary. Touch devices fall back to
 * tap-to-open via the same Radix primitive.
 */
function QuestionHover({ q, stats }: { q: SurveyQuestion; stats: QuestionStats }) {
  return (
    <HoverCardPrimitive.Root openDelay={120} closeDelay={80}>
      <HoverCardPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Question ${q.order}: ${q.text}`}
          className="mono text-[11px] font-bold tabular text-[color:var(--ink-soft)] cursor-help hover:text-[color:var(--blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--blue)]/40 rounded"
        >
          Q{q.order}
        </button>
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          align="center"
          sideOffset={6}
          className="z-50 max-w-[360px] rounded-2xl border bg-[color:var(--card)] p-4 shadow-lg"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10.5px] uppercase tracking-wide font-semibold text-[color:var(--ink-mute)]">
              Question {q.order}
            </div>
            <Pill tone="mute">{QUESTION_TYPE_LABEL[q.type] ?? q.type}</Pill>
          </div>
          <p className="text-[13px] text-[color:var(--ink)] whitespace-pre-wrap break-words text-left">
            {q.text}
          </p>
          {(q.captain_only || q.conditional || q.flag_rule) && (
            <ul className="mt-3 space-y-1 text-[11.5px] text-[color:var(--ink-mute)] text-left">
              {q.captain_only && <li>· captain only</li>}
              {q.conditional && (
                <li>· shows when <span className="mono">{q.conditional.depends_on}</span> = <span className="mono">{q.conditional.show_if}</span></li>
              )}
              {q.flag_rule && (
                <li>· flags <span className="mono">{q.flag_rule.flag_type}</span> when <span className="mono">{q.flag_rule.condition}</span></li>
              )}
            </ul>
          )}
          {stats.kind !== 'empty' && (
            <div className="mt-3 pt-3 border-t text-[11.5px] text-[color:var(--ink-mute)] text-left" style={{ borderColor: 'var(--border)' }}>
              <SummaryBar stats={stats} />
            </div>
          )}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}

/**
 * Compact team-level summary used in the question hover popover.
 * Type-aware so the label matches the answer space (avg out-of-N for
 * scales, % yes for binary, etc.).
 */
function SummaryBar({ stats }: { stats: QuestionStats }) {
  if (stats.kind === 'empty') {
    return <span>—</span>;
  }
  if (stats.kind === 'numeric') {
    return (
      <span className="mono tabular">
        avg {stats.mean.toFixed(1)} / {stats.max} · {stats.count}
      </span>
    );
  }
  if (stats.kind === 'binary') {
    const pct = stats.count === 0 ? 0 : Math.round((stats.yes / stats.count) * 100);
    return (
      <span className="mono tabular">
        {pct}% yes · {stats.count}
      </span>
    );
  }
  if (stats.kind === 'choice_1_3') {
    const [light, right, heavy] = stats.buckets;
    return (
      <span className="mono tabular">
        {light} / {right} / {heavy} · {stats.count}
      </span>
    );
  }
  return (
    <span className="mono tabular">
      {stats.count} repl{stats.count === 1 ? 'y' : 'ies'}
    </span>
  );
}
