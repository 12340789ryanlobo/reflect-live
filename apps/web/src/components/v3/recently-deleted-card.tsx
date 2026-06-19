'use client';

// Athlete-page "Recently deleted" disclosure. Lists soft-deleted
// activity_logs + self-report sessions for this player and offers a
// Restore button per entry. Collapsed by default; renders nothing when
// the trash is empty. Restoring calls the restore endpoint, then fires
// onRestored so the page bumps its data signal (timeline + standings
// refresh) and reloads the trash list.

import { useEffect, useState, useCallback } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';

interface Props {
  playerId: number;
  refreshKey: number;      // bump to refetch the trash list (after a delete/restore)
  onRestored: () => void;  // page bumps dataTick so the other cards refresh
}

interface LogTrash { id: number; kind: string | null; description: string | null; logged_at: string; }
interface SessionTrash { session_id: string; label: string; date_sent: string; }

export function RecentlyDeletedCard({ playerId, refreshKey, onRestored }: Props) {
  const [logs, setLogs] = useState<LogTrash[]>([]);
  const [sessions, setSessions] = useState<SessionTrash[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [logRes, sessRes] = await Promise.all([
      fetch(`/api/activity-logs/trash?player_id=${playerId}`, { cache: 'no-store' }),
      fetch(`/api/self-report/trash?player_id=${playerId}`, { cache: 'no-store' }),
    ]);
    if (logRes.ok) {
      const { entries = [] } = (await logRes.json()) as { entries: LogTrash[] };
      setLogs(entries);
    }
    if (sessRes.ok) {
      const { sessions: s = [] } = (await sessRes.json()) as { sessions: SessionTrash[] };
      setSessions(s);
    }
  }, [playerId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const count = logs.length + sessions.length;
  if (count === 0) return null;

  async function restoreLog(id: number) {
    setBusy(`log:${id}`);
    const r = await fetch(`/api/activity-logs/${id}/restore`, { method: 'POST' });
    setBusy(null);
    if (r.ok) { onRestored(); load(); }
  }

  async function restoreSession(sessionId: string) {
    setBusy(`msg:${sessionId}`);
    const r = await fetch(
      `/api/self-report/${encodeURIComponent(sessionId)}/restore`,
      { method: 'POST' },
    );
    setBusy(null);
    if (r.ok) { onRestored(); load(); }
  }

  return (
    <section className="rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-6 py-4 text-left"
      >
        <Trash2 className="size-4" style={{ color: 'var(--ink-mute)' }} />
        <h2 className="text-base font-bold text-[color:var(--ink)]">Recently deleted ({count})</h2>
        <span className="ml-auto text-[12px] text-[color:var(--ink-mute)]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul className="border-t" style={{ borderColor: 'var(--border)' }}>
          {logs.map((l) => (
            <li
              key={`log:${l.id}`}
              className="flex items-center gap-4 px-6 py-3 border-b last:border-b-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-[color:var(--ink)]">
                  {l.kind ?? 'activity'}{l.description ? ` — ${l.description}` : ''}
                </div>
                <div className="text-[11px] text-[color:var(--ink-mute)]">{l.logged_at.slice(0, 10)}</div>
              </div>
              <button
                onClick={() => restoreLog(l.id)}
                disabled={busy === `log:${l.id}`}
                className="flex items-center gap-1 text-[12px] text-[color:var(--blue)] hover:underline disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" /> Restore
              </button>
            </li>
          ))}
          {sessions.map((s) => (
            <li
              key={`msg:${s.session_id}`}
              className="flex items-center gap-4 px-6 py-3 border-b last:border-b-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-[color:var(--ink)]">{s.label}</div>
                <div className="text-[11px] text-[color:var(--ink-mute)]">{s.date_sent.slice(0, 10)}</div>
              </div>
              <button
                onClick={() => restoreSession(s.session_id)}
                disabled={busy === `msg:${s.session_id}`}
                className="flex items-center gap-1 text-[12px] text-[color:var(--blue)] hover:underline disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" /> Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
