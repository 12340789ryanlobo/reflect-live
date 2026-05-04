'use client';

// Athlete-side self-report dialog. Two modes:
//
//   1. Multi-question (preferred) — pulls a deduped question list from
//      /api/self-report/questions (sources: last 14 days of non-deleted
//      sessions, or fallback to the most recent one). Renders one
//      input per question (1-10 / yes-no / text), submits a single
//      POST to /api/self-report with `answers: [...]`. The server
//      writes synthetic Q+A pairs into twilio_messages so survey-trends
//      buckets the answers in the same metrics as the SMS path.
//
//   2. Empty fallback — when no recent session has questions defined,
//      we drop back to the legacy 1-10 readiness only form, which is
//      still wired up on the server.
//
// `show_if`/`depends_on` are honored client-side so a 'No pain'
// answer hides the body-regions follow-up — same conditional logic
// the SMS bot applies.

import { useEffect, useMemo, useState } from 'react';
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

interface QuestionDef {
  id: string;
  text: string;
  type: string;
  order: number;
  show_if?: string;
  depends_on?: string;
}

function toneFor(n: number): string {
  if (n <= 4) return 'var(--red)';
  if (n <= 6) return 'var(--amber)';
  return 'var(--green)';
}

function labelFor(n: number): string {
  if (n <= 2) return 'Cooked';
  if (n <= 4) return 'Heavy';
  if (n <= 6) return 'OK';
  if (n <= 8) return 'Solid';
  return 'Flying';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: number;
  onSaved: () => void;
}

export function SelfReportDialog({ open, onOpenChange, playerId, onSaved }: Props) {
  const [questions, setQuestions] = useState<QuestionDef[] | null>(null);
  const [source, setSource] = useState<string>('');
  // answers[question_id] = string. Empty = unanswered.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Legacy readiness/notes path (when no questions are defined).
  const [legacyReadiness, setLegacyReadiness] = useState<number | null>(null);
  const [legacyNotes, setLegacyNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestions(null);
    setAnswers({});
    setLegacyReadiness(null);
    setLegacyNotes('');
    setErr(null);
    setLoading(true);
    (async () => {
      try {
        const r = await fetch('/api/self-report/questions', { cache: 'no-store' });
        const j = await r.json();
        if (Array.isArray(j.questions) && j.questions.length > 0) {
          setQuestions(j.questions as QuestionDef[]);
          setSource(j.source ?? '');
        } else {
          setQuestions([]);
          setSource(j.source ?? 'none');
        }
      } catch {
        setQuestions([]);
        setSource('none');
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  // Filter questions by show_if/depends_on. A question with
  // depends_on='q_pain_check' and show_if='yes' only shows when the
  // pain-check answer is 1 (binary yes).
  const visibleQuestions = useMemo(() => {
    if (!questions) return [];
    return questions.filter((q) => {
      if (!q.depends_on || !q.show_if) return true;
      const dep = answers[q.depends_on];
      if (q.show_if === 'yes') return dep === '1';
      if (q.show_if === 'no') return dep === '0';
      return true;
    });
  }, [questions, answers]);

  const hasMulti = (questions?.length ?? 0) > 0;

  function setA(qid: string, v: string) {
    setAnswers((prev) => ({ ...prev, [qid]: v }));
  }

  async function save() {
    setErr(null);
    if (hasMulti) {
      const payloadAnswers = visibleQuestions
        .map((q) => ({
          question_id: q.id,
          question_text: q.text,
          answer_text: (answers[q.id] ?? '').trim(),
        }))
        .filter((a) => a.answer_text.length > 0);
      if (payloadAnswers.length === 0) {
        setErr('Answer at least one question.');
        return;
      }
      setSaving(true);
      const res = await fetch('/api/self-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, answers: payloadAnswers }),
      });
      setSaving(false);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.detail ?? j.error ?? `Save failed (${res.status}).`);
        return;
      }
      onSaved();
      onOpenChange(false);
      return;
    }

    // Legacy readiness path
    if (legacyReadiness == null) {
      setErr('Pick a number 1-10.');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/self-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        player_id: playerId,
        readiness: legacyReadiness,
        notes: legacyNotes.trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.detail ?? j.error ?? `Save failed (${res.status}).`);
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{hasMulti ? 'Self-report' : 'Today’s check-in'}</DialogTitle>
          <DialogDescription>
            {loading
              ? 'Loading recent questions…'
              : hasMulti
                ? source === 'last-14d'
                  ? 'Answer any of the questions used in your team’s recent surveys. Skip what you don’t want to answer.'
                  : 'Answer any of the questions from your team’s most recent survey.'
                : 'How ready do you feel right now? 1 = wrecked, 10 = flying. Same scale as the SMS check-in.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {hasMulti
            ? visibleQuestions.map((q) => (
                <QuestionInput
                  key={q.id}
                  question={q}
                  value={answers[q.id] ?? ''}
                  onChange={(v) => setA(q.id, v)}
                />
              ))
            : !loading && (
                <LegacyReadinessForm
                  readiness={legacyReadiness}
                  setReadiness={setLegacyReadiness}
                  notes={legacyNotes}
                  setNotes={setLegacyNotes}
                />
              )}

          {err && (
            <p className="text-[12px]" style={{ color: 'var(--red)' }}>
              {err}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? 'Logging…' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: QuestionDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = question.type;
  if (t === 'scale_1_10') {
    return <ScaleInput question={question} value={value} onChange={onChange} />;
  }
  if (t === 'binary') {
    return <BinaryInput question={question} value={value} onChange={onChange} />;
  }
  // multi_select_body_regions and free_text both render as a free-form
  // text input. Body regions follow the SMS bot's convention of a
  // comma-separated list (e.g. 'lower back, left quad').
  return <TextInput question={question} value={value} onChange={onChange} />;
}

function ScaleInput({
  question,
  value,
  onChange,
}: {
  question: QuestionDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const num = Number(value);
  const active = Number.isFinite(num) && num >= 1 && num <= 10 ? num : null;
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-[color:var(--ink-soft)] whitespace-pre-line">{question.text}</p>
      <div className="grid grid-cols-10 gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const isActive = active === n;
          const tone = toneFor(n);
          return (
            <button
              key={n}
              type="button"
              // Click the active number to clear it — gives the user
              // a way back to 'unanswered' (skip) without having to
              // refresh the dialog. Submission already drops empty
              // answers from the payload.
              onClick={() => onChange(isActive ? '' : String(n))}
              aria-pressed={isActive}
              aria-label={isActive ? `Clear ${n}` : `${n}`}
              className="h-9 rounded-md border text-[13px] font-bold tabular transition focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
              style={{
                borderColor: isActive ? tone : 'var(--border)',
                background: isActive ? tone : 'transparent',
                color: isActive ? 'var(--paper)' : 'var(--ink-soft)',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      {active != null && (
        <p className="text-[11.5px] font-semibold" style={{ color: toneFor(active) }}>
          {active} · {labelFor(active)}
        </p>
      )}
    </div>
  );
}

function BinaryInput({
  question,
  value,
  onChange,
}: {
  question: QuestionDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const isYes = value === '1';
  const isNo = value === '0';
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-[color:var(--ink-soft)] whitespace-pre-line">{question.text}</p>
      <div className="flex gap-2">
        <button
          type="button"
          // Click-active-to-clear, so the user can return to
          // 'unanswered' (skip) without dialog refresh.
          onClick={() => onChange(isNo ? '' : '0')}
          aria-pressed={isNo}
          aria-label={isNo ? 'Clear No' : 'No'}
          className="flex-1 h-9 rounded-md border text-[13px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
          style={{
            borderColor: isNo ? 'var(--green)' : 'var(--border)',
            background: isNo ? 'var(--green)' : 'transparent',
            color: isNo ? 'var(--paper)' : 'var(--ink-soft)',
          }}
        >
          No
        </button>
        <button
          type="button"
          onClick={() => onChange(isYes ? '' : '1')}
          aria-pressed={isYes}
          aria-label={isYes ? 'Clear Yes' : 'Yes'}
          className="flex-1 h-9 rounded-md border text-[13px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
          style={{
            borderColor: isYes ? 'var(--amber)' : 'var(--border)',
            background: isYes ? 'var(--amber)' : 'transparent',
            color: isYes ? 'var(--paper)' : 'var(--ink-soft)',
          }}
        >
          Yes
        </button>
      </div>
    </div>
  );
}

function TextInput({
  question,
  value,
  onChange,
}: {
  question: QuestionDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const placeholder = question.type === 'multi_select_body_regions'
    ? 'e.g. lower back, left quad'
    : 'Type your answer';
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] text-[color:var(--ink-soft)] whitespace-pre-line">{question.text}</p>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={500}
        className="h-9 text-[13px]"
      />
    </div>
  );
}

function LegacyReadinessForm({
  readiness,
  setReadiness,
  notes,
  setNotes,
}: {
  readiness: number | null;
  setReadiness: (n: number | null) => void;
  notes: string;
  setNotes: (s: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <div className="grid grid-cols-10 gap-1.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const active = readiness === n;
            const tone = toneFor(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => setReadiness(n)}
                aria-pressed={active}
                aria-label={`Readiness ${n}`}
                className="h-10 rounded-md border text-[14px] font-bold tabular transition focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
                style={{
                  borderColor: active ? tone : 'var(--border)',
                  background: active ? tone : 'transparent',
                  color: active ? 'var(--paper)' : 'var(--ink-soft)',
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
        {readiness != null && (
          <p className="text-[12px] font-semibold" style={{ color: toneFor(readiness) }}>
            {readiness} · {labelFor(readiness)}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="self-notes" className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
          Anything to flag <span className="text-[color:var(--ink-dim)] normal-case">(optional)</span>
        </label>
        <Input
          id="self-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="tight hamstrings, skipped lift, slept 5h, etc."
          maxLength={500}
          className="h-9 text-[13px]"
        />
      </div>
    </>
  );
}
