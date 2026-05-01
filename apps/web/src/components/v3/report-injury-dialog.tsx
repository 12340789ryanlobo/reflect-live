'use client';

// Report a new injury from the athlete page. Hits POST
// /api/injury-reports which auto-parses body regions out of the
// description string, so the heatmap lights up without the user having
// to tag regions manually.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const SEVERITY: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string; tone: string }> = [
  { value: 1, label: 'Mild · twinge',         tone: 'var(--green)' },
  { value: 2, label: 'Light · noticeable',    tone: 'var(--green)' },
  { value: 3, label: 'Moderate · limits work', tone: 'var(--amber)' },
  { value: 4, label: 'Sharp · stops work',    tone: 'var(--red)' },
  { value: 5, label: 'Severe · trainer now',  tone: 'var(--red)' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: number;
  /** True when the viewer is the athlete themselves — the API infers
   *  the player_id from the user's prefs in that case, but we still
   *  pass it through for the coach-on-behalf path. */
  viewerIsSelf: boolean;
  onSaved: () => void;
}

export function ReportInjuryDialog({ open, onOpenChange, playerId, viewerIsSelf, onSaved }: Props) {
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setSeverity(null);
    setErr(null);
  }, [open]);

  async function save() {
    const desc = description.trim();
    if (!desc) {
      setErr('Describe the injury — body region words help the heatmap (e.g. "left shoulder").');
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await fetch('/api/injury-reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        // Coach/admin path needs player_id explicitly; athlete path
        // ignores it and uses the linked player from prefs.
        player_id: viewerIsSelf ? undefined : playerId,
        description: desc,
        severity,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report injury</DialogTitle>
          <DialogDescription>
            Describe what hurts and how bad it is. Mentioning the body
            region by name (e.g. &ldquo;left shoulder&rdquo;,
            &ldquo;hamstring&rdquo;) lights up the heatmap automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="inj-desc" className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
              What and where
            </label>
            <textarea
              id="inj-desc"
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. tweaked left hamstring during sprints, sharp on lengthening"
              rows={4}
              className="w-full rounded-md border bg-[color:var(--paper)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-dim)] focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
              Severity <span className="text-[color:var(--ink-dim)] normal-case">(optional)</span>
            </label>
            <div className="space-y-1">
              {SEVERITY.map((s) => {
                const active = severity === s.value;
                return (
                  <label
                    key={s.value}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 cursor-pointer transition ${
                      active ? 'bg-[color:var(--paper-2)]' : 'hover:bg-[color:var(--paper-2)]'
                    }`}
                    style={{ borderColor: active ? s.tone : 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: s.tone }}
                      />
                      <span className="text-[13px] text-[color:var(--ink)]">
                        <span className="font-semibold mr-1">{s.value}</span>
                        {s.label}
                      </span>
                    </div>
                    <input
                      type="radio"
                      name="severity"
                      checked={active}
                      onChange={() => setSeverity(s.value)}
                      className="size-3.5 accent-[color:var(--blue)]"
                    />
                  </label>
                );
              })}
              {severity != null && (
                <button
                  type="button"
                  onClick={() => setSeverity(null)}
                  className="text-[11.5px] text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] mt-1"
                >
                  Clear severity
                </button>
              )}
            </div>
          </div>

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
          <Button onClick={save} disabled={saving || !description.trim()}>
            {saving ? 'Reporting…' : 'Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
