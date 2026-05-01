'use client';

// Today's check-in. Athlete picks readiness 1-10 and optionally adds a
// note. Posts to /api/self-report which writes a synthetic
// twilio_messages row matching the SMS survey shape, so the existing
// readiness bar + LLM summary pick it up automatically.

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
import { Input } from '@/components/ui/input';

// 1-4 = red (load management), 5-6 = amber, 7-10 = green. Same
// thresholds the rules-based summary uses.
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
  const [readiness, setReadiness] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReadiness(null);
    setNotes('');
    setErr(null);
  }, [open]);

  async function save() {
    if (readiness == null) {
      setErr('Pick a number 1-10.');
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await fetch('/api/self-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        player_id: playerId,
        readiness,
        notes: notes.trim() || undefined,
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
          <DialogTitle>Today&rsquo;s check-in</DialogTitle>
          <DialogDescription>
            How ready do you feel right now? 1 = wrecked, 10 = flying.
            Same scale as the SMS check-in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              <p
                className="text-[12px] font-semibold"
                style={{ color: toneFor(readiness) }}
              >
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
          <Button onClick={save} disabled={saving || readiness == null}>
            {saving ? 'Logging…' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
