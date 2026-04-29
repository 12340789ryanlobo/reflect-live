'use client';

// Templates editor — coaches/captains author reusable question sets per
// session type. A session can attach a template_id; otherwise the YAML
// default takes over. Frozen-snapshot semantics live in the engine
// (sessions copy questions_json into metadata_json on first run).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from '@/components/v3/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronUp, Plus, Star, Trash2 } from 'lucide-react';
import type { SessionType, SurveyQuestion } from '@reflect-live/shared';

interface TemplateRow {
  id: number;
  name: string;
  session_type: SessionType;
  questions_json: SurveyQuestion[];
  is_default: boolean;
  created_at: string;
}

type EditTarget = 'new' | { id: number } | null;

const TYPE_LABEL: Record<SessionType, string> = {
  practice: 'Practice',
  match: 'Competition',
  lifting: 'Lifting',
};
const TYPE_TONE: Record<SessionType, 'blue' | 'amber' | 'green'> = {
  practice: 'blue',
  match: 'amber',
  lifting: 'green',
};
const QUESTION_TYPES: { value: SurveyQuestion['type']; label: string; hint: string }[] = [
  { value: 'scale_1_10', label: '1-10 scale', hint: 'numeric, 1 (low) → 10 (high)' },
  { value: 'binary', label: 'Yes / no', hint: 'reply 0/1 or yes/no' },
  { value: 'choice_1_3', label: '1-3 choice', hint: 'too light / about right / too heavy' },
  { value: 'captain_rating', label: 'Captain rating', hint: 'number + free comment' },
  { value: 'multi_select_body_regions', label: 'Body regions', hint: 'multi-region with rating' },
  { value: 'free_text', label: 'Free text', hint: 'open response' },
];
const FLAG_OPTIONS = [
  { value: '', label: 'No flag' },
  { value: 'low_readiness:value <= 3:medium', label: 'Low readiness (≤ 3)' },
  { value: 'high_pain:value >= 7:high', label: 'High pain (≥ 7)' },
  { value: 'injury_concern:value == 1:high', label: 'Injury concern (yes)' },
];
const MAX_QUESTIONS = 8;

function blankQuestion(order: number): SurveyQuestion {
  return {
    id: `q${order}`,
    order,
    text: '',
    type: 'scale_1_10',
    validation: { required: true, min: 1, max: 10 },
  };
}

function flagSelectValue(q: SurveyQuestion): string {
  if (!q.flag_rule) return '';
  return `${q.flag_rule.flag_type}:${q.flag_rule.condition}:${q.flag_rule.severity ?? 'medium'}`;
}
function parseFlagSelect(v: string): SurveyQuestion['flag_rule'] | undefined {
  if (!v) return undefined;
  const [flag_type, condition, severity] = v.split(':');
  return { flag_type: flag_type as 'low_readiness' | 'high_pain' | 'injury_concern' | 'custom', condition, severity: severity as 'low' | 'medium' | 'high' };
}

export default function TemplatesPage() {
  const { prefs, role } = useDashboard();
  const sb = useSupabase();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditTarget>(null);
  const canEdit = role === 'coach' || role === 'captain' || role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from('question_templates')
      .select('*')
      .eq('team_id', prefs.team_id)
      .order('session_type')
      .order('name');
    setRows(((data ?? []) as TemplateRow[]).map((r) => ({
      ...r,
      questions_json: Array.isArray(r.questions_json) ? r.questions_json : [],
    })));
    setLoading(false);
  }, [sb, prefs.team_id]);

  useEffect(() => { load(); }, [load]);

  const editingRow = typeof editing === 'object' && editing !== null
    ? rows.find((r) => r.id === editing.id) ?? null
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Survey engine"
        title="Templates"
        subtitle={
          rows.length === 0
            ? 'No templates yet — sessions will use the default question set'
            : `${rows.length} template${rows.length === 1 ? '' : 's'}`
        }
        actions={
          canEdit && editing === null ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="size-4 mr-1" /> New template
            </Button>
          ) : null
        }
      />

      <main className="px-6 pb-12 pt-4 space-y-6">
        {editing !== null ? (
          <TemplateEditor
            initial={editingRow ?? null}
            onCancel={() => setEditing(null)}
            onSaved={async () => { setEditing(null); await load(); }}
            onDeleted={async () => { setEditing(null); await load(); }}
            canDelete={editing !== 'new' && (role === 'coach' || role === 'admin')}
          />
        ) : (
          <TemplateList
            rows={rows}
            loading={loading}
            onEdit={(id) => setEditing({ id })}
          />
        )}
      </main>
    </>
  );
}

function TemplateList({
  rows, loading, onEdit,
}: { rows: TemplateRow[]; loading: boolean; onEdit: (id: number) => void }) {
  const grouped = useMemo(() => {
    const out: Record<SessionType, TemplateRow[]> = { practice: [], match: [], lifting: [] };
    for (const r of rows) out[r.session_type].push(r);
    return out;
  }, [rows]);

  if (loading) {
    return <p className="text-[13px] text-[color:var(--ink-mute)]">— loading —</p>;
  }
  if (rows.length === 0) {
    return (
      <section className="rounded-2xl bg-[color:var(--card)] border px-6 py-10 text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="text-[14px] font-semibold text-[color:var(--ink)]">No templates yet</p>
        <p className="mt-1 text-[12.5px] text-[color:var(--ink-mute)]">
          Sessions fall back to the bundled default questions until you add one.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {(['practice', 'match', 'lifting'] as SessionType[]).map((t) => {
        const list = grouped[t];
        if (list.length === 0) return null;
        return (
          <div key={t} className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">{TYPE_LABEL[t]}</h2>
              <Pill tone={TYPE_TONE[t]}>{list.length} template{list.length === 1 ? '' : 's'}</Pill>
            </header>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {list.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onEdit(r.id)}
                    className="w-full text-left px-6 py-3.5 hover:bg-[color:var(--paper-2)] transition flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[color:var(--ink)]">{r.name}</span>
                        {r.is_default && (
                          <Pill tone="blue">
                            <Star className="size-3 mr-1 inline-block" />default
                          </Pill>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-[color:var(--ink-mute)]">
                        {r.questions_json.length} question{r.questions_json.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function TemplateEditor({
  initial, onCancel, onSaved, onDeleted, canDelete,
}: {
  initial: TemplateRow | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  canDelete: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sessionType, setSessionType] = useState<SessionType>(initial?.session_type ?? 'practice');
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(
    initial?.questions_json && initial.questions_json.length > 0
      ? initial.questions_json
      : [blankQuestion(1)],
  );
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  function update(idx: number, patch: Partial<SurveyQuestion>) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }
  function move(idx: number, delta: -1 | 1) {
    setQuestions((qs) => {
      const next = qs.slice();
      const j = idx + delta;
      if (j < 0 || j >= next.length) return qs;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((q, i) => ({ ...q, order: i + 1 }));
    });
  }
  function add() {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions((qs) => [...qs, blankQuestion(qs.length + 1)]);
  }
  function remove(idx: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i + 1 })));
  }

  const earlierBinaries = useMemo(() => {
    return questions
      .filter((q) => q.type === 'binary' && q.text.trim())
      .map((q, _, arr) => ({ id: q.id, label: q.text, order: q.order, idx: arr.findIndex((x) => x.id === q.id) }));
  }, [questions]);

  async function save() {
    setSaving(true); setErrMsg(null);
    const cleanQs = questions.map((q, i) => ({
      ...q,
      order: i + 1,
      validation: defaultValidation(q.type, q.validation),
    }));
    const url = initial ? `/api/templates/${initial.id}` : '/api/templates';
    const res = await fetch(url, {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        session_type: sessionType,
        questions: cleanQs,
        is_default: isDefault,
      }),
    });
    setSaving(false);
    if (res.ok) { await onSaved(); }
    else {
      const j = await res.json().catch(() => ({}));
      setErrMsg(j.error ?? 'save failed');
    }
  }

  async function del() {
    if (!initial || !confirm(`Delete "${initial.name}"? Past sessions stay readable (they have a frozen snapshot).`)) return;
    const res = await fetch(`/api/templates/${initial.id}`, { method: 'DELETE' });
    if (res.ok) await onDeleted();
  }

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold text-[color:var(--ink)]">
          {initial ? 'Edit template' : 'New template'}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={del}>
              <Trash2 className="size-4 text-[color:var(--red)]" />
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={saving || !name.trim() || questions.some((q) => !q.text.trim())}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Create template'}
          </Button>
        </div>
      </header>

      <div className="px-6 py-5 space-y-5">
        {/* Header fields */}
        <div className="grid gap-4 md:grid-cols-[1fr_180px_auto] items-end">
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="t-name">Name</label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hard practice check-in"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="t-type">Session type</label>
            <Select value={sessionType} onValueChange={(v) => setSessionType(v as SessionType)}>
              <SelectTrigger id="t-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="practice">Practice</SelectItem>
                <SelectItem value="match">Competition</SelectItem>
                <SelectItem value="lifting">Lifting</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-4"
            />
            Use as default for {TYPE_LABEL[sessionType].toLowerCase()}
          </label>
        </div>

        {/* Questions */}
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <QuestionRow
              key={`${q.id}-${idx}`}
              q={q}
              idx={idx}
              total={questions.length}
              earlierBinaries={earlierBinaries.filter((eb) => eb.idx < idx)}
              onChange={(p) => update(idx, p)}
              onMove={(d) => move(idx, d)}
              onRemove={() => remove(idx)}
            />
          ))}
          {questions.length < MAX_QUESTIONS && (
            <button
              type="button"
              onClick={add}
              className="w-full rounded-xl border border-dashed py-3 text-[12.5px] font-semibold text-[color:var(--ink-mute)] hover:bg-[color:var(--paper-2)] hover:text-[color:var(--ink)]"
              style={{ borderColor: 'var(--border-2)' }}
            >
              <Plus className="size-4 inline mr-1" /> Add question ({questions.length}/{MAX_QUESTIONS})
            </button>
          )}
        </div>

        {errMsg && <p className="text-[12.5px] text-[color:var(--red)]">{errMsg}</p>}
      </div>
    </section>
  );
}

function QuestionRow({
  q, idx, total, earlierBinaries, onChange, onMove, onRemove,
}: {
  q: SurveyQuestion;
  idx: number;
  total: number;
  earlierBinaries: { id: string; label: string }[];
  onChange: (patch: Partial<SurveyQuestion>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const showFlagControl = q.type === 'scale_1_10' || q.type === 'binary' || q.type === 'choice_1_3';
  const conditional = q.conditional;

  return (
    <div className="rounded-xl border bg-[color:var(--paper)] p-4" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-0.5 pt-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            aria-label="Move up"
            className="rounded p-0.5 text-[color:var(--ink-mute)] hover:bg-[color:var(--paper-2)] disabled:opacity-30"
          ><ChevronUp className="size-4" /></button>
          <span className="text-center mono text-[10.5px] font-bold tabular text-[color:var(--ink-mute)]">
            {idx + 1}
          </span>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            aria-label="Move down"
            className="rounded p-0.5 text-[color:var(--ink-mute)] hover:bg-[color:var(--paper-2)] disabled:opacity-30"
          ><ChevronDown className="size-4" /></button>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <textarea
            value={q.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={2}
            placeholder="Question text…"
            className="w-full rounded-md border bg-[color:var(--card)] px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--blue)]/40"
            style={{ borderColor: 'var(--border)' }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Select value={q.type} onValueChange={(v) => onChange({ type: v as SurveyQuestion['type'], validation: defaultValidation(v as SurveyQuestion['type']) })}>
              <SelectTrigger className="h-8 w-[160px] text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {showFlagControl && (
              <Select
                value={flagSelectValue(q)}
                onValueChange={(v) => onChange({ flag_rule: parseFlagSelect(v) })}
              >
                <SelectTrigger className="h-8 w-[200px] text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FLAG_OPTIONS.map((o) => (
                    <SelectItem key={o.value || 'none'} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={!!q.captain_only}
                onChange={(e) => onChange({ captain_only: e.target.checked || undefined })}
                className="size-3.5"
              />
              Captain only
            </label>

            {earlierBinaries.length > 0 && (
              <Select
                value={conditional?.depends_on ?? ''}
                onValueChange={(v) => onChange({ conditional: v ? { depends_on: v, show_if: conditional?.show_if ?? 'value == 1' } : undefined })}
              >
                <SelectTrigger className="h-8 w-[200px] text-[12.5px]">
                  <SelectValue placeholder="Always show" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Always show</SelectItem>
                  {earlierBinaries.map((eb) => (
                    <SelectItem key={eb.id} value={eb.id}>Show if {eb.id} = yes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove question"
          className="rounded p-1 text-[color:var(--ink-mute)] hover:bg-[color:var(--paper-2)] hover:text-[color:var(--red)]"
        ><Trash2 className="size-4" /></button>
      </div>
    </div>
  );
}

function defaultValidation(type: SurveyQuestion['type'], existing?: SurveyQuestion['validation']): SurveyQuestion['validation'] {
  switch (type) {
    case 'scale_1_10':            return { required: true, min: 1, max: 10 };
    case 'binary':                return { required: true };
    case 'choice_1_3':            return { required: true, min: 1, max: 3 };
    case 'captain_rating':        return { required: true, min: 1, max: 10, max_length: 300 };
    case 'multi_select_body_regions': return { required: existing?.required ?? false };
    case 'free_text':             return { required: existing?.required ?? true, max_length: 800 };
    default:                      return existing ?? {};
  }
}
