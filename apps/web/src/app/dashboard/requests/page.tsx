'use client';

// Coach/captain inbox for pending join requests on the active team.
// Approve or deny one at a time. Approval creates a players row and
// flips the membership to active; the athlete's pending banner flips
// via realtime on the next render.

import { useCallback, useEffect, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Pill } from '@/components/v3/pill';
import { Check, X } from 'lucide-react';
import { relativeTime } from '@/lib/format';

interface RequestRow {
  clerk_user_id: string;
  team_id: number;
  requested_name: string | null;
  requested_email: string | null;
  requested_phone: string | null;
  requested_at: string;
}

export default function RequestsPage() {
  const { prefs, role } = useDashboard();
  const sb = useSupabase();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [denyTarget, setDenyTarget] = useState<RequestRow | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  function showFlash(tone: 'ok' | 'warn', text: string) {
    setFlash({ tone, text });
    setTimeout(() => setFlash(null), 6000);
  }

  function describeSmsResult(
    name: string | null,
    decision: 'approved' | 'denied',
    sms: { ok: true } | { ok: false; error: string } | undefined,
  ): { tone: 'ok' | 'warn'; text: string } {
    const who = name ?? 'request';
    if (sms?.ok) return { tone: 'ok', text: `${who} ${decision}. SMS sent.` };
    if (sms && !sms.ok) {
      if (sms.error === 'no_phone') {
        return { tone: 'warn', text: `${who} ${decision}. No phone on file — no SMS sent.` };
      }
      return { tone: 'warn', text: `${who} ${decision}. SMS failed: ${sms.error}` };
    }
    return { tone: 'warn', text: `${who} ${decision}.` };
  }

  const canManage = role === 'coach' || role === 'captain' || role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/teams/${prefs.team_id}/requests`);
    if (r.ok) {
      const j = await r.json();
      setRows(j.requests ?? []);
    } else {
      setRows([]);
    }
    setLoading(false);
  }, [prefs.team_id]);

  useEffect(() => { load(); }, [load]);

  // Realtime: when membership rows on this team change, refresh.
  useEffect(() => {
    const channel = sb
      .channel(`team_requests_${prefs.team_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_memberships', filter: `team_id=eq.${prefs.team_id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [sb, prefs.team_id, load]);

  async function approve(req: RequestRow) {
    setActingOn(req.clerk_user_id);
    const res = await fetch(`/api/teams/${prefs.team_id}/requests/${encodeURIComponent(req.clerk_user_id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    const j = res.ok ? await res.json().catch(() => null) : null;
    setActingOn(null);
    const f = describeSmsResult(req.requested_name, 'approved', j?.sms);
    showFlash(f.tone, f.text);
    await load();
  }

  async function submitDeny() {
    if (!denyTarget) return;
    setActingOn(denyTarget.clerk_user_id);
    const res = await fetch(`/api/teams/${prefs.team_id}/requests/${encodeURIComponent(denyTarget.clerk_user_id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'deny', reason: denyReason.trim() || null }),
    });
    const j = res.ok ? await res.json().catch(() => null) : null;
    const target = denyTarget;
    setActingOn(null);
    setDenyTarget(null);
    setDenyReason('');
    const f = describeSmsResult(target.requested_name, 'denied', j?.sms);
    showFlash(f.tone, f.text);
    await load();
  }

  if (!canManage) {
    return (
      <main className="px-6 py-12 text-center">
        <p className="text-[13px] text-[color:var(--ink-mute)]">
          Only coaches, captains, and admins can view pending requests.
        </p>
      </main>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title="Pending requests"
        subtitle={
          loading
            ? '— loading —'
            : rows.length === 0
              ? 'No pending requests'
              : `${rows.length} awaiting decision`
        }
      />
      <main className="px-6 pb-12 pt-4">
        {flash && (
          <div
            className="mb-4 rounded-lg border px-4 py-2.5 text-[13px]"
            style={{
              borderColor: flash.tone === 'ok' ? 'var(--green)' : 'var(--amber)',
              backgroundColor: flash.tone === 'ok' ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'color-mix(in srgb, var(--amber) 8%, transparent)',
              color: 'var(--ink)',
            }}
            role="status"
          >
            {flash.text}
          </div>
        )}
        <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          {loading ? (
            <p className="px-6 py-10 text-[13px] text-[color:var(--ink-mute)]">— loading —</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-[color:var(--ink-mute)]">
              No one is waiting. Athletes who request to join will show up here.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {rows.map((r) => (
                <li key={r.clerk_user_id} className="px-6 py-4 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-[color:var(--ink)]">
                        {r.requested_name ?? '—'}
                      </span>
                      <Pill tone="amber">pending</Pill>
                    </div>
                    <p className="mt-1 text-[12.5px] text-[color:var(--ink-soft)]">
                      {r.requested_phone && <span className="mono">{r.requested_phone}</span>}
                      {r.requested_phone && r.requested_email && <span className="mx-1.5 text-[color:var(--ink-mute)]">·</span>}
                      {r.requested_email && <span>{r.requested_email}</span>}
                    </p>
                    <p className="mt-1 mono text-[11px] text-[color:var(--ink-mute)] tabular">
                      requested {relativeTime(r.requested_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => approve(r)}
                      disabled={actingOn === r.clerk_user_id}
                      className="font-bold"
                    >
                      <Check className="size-4 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setDenyTarget(r); setDenyReason(''); }}
                      disabled={actingOn === r.clerk_user_id}
                      className="text-[color:var(--ink-mute)] hover:text-[color:var(--red)]"
                    >
                      <X className="size-4 mr-1" /> Deny
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Dialog open={!!denyTarget} onOpenChange={(o) => { if (!o) setDenyTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny request from {denyTarget?.requested_name ?? '—'}?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <label className="text-[12.5px] font-semibold" htmlFor="deny-reason">Reason (optional)</label>
            <textarea
              id="deny-reason"
              rows={3}
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Sent to the athlete with the denial."
              className="rounded-md border bg-[color:var(--card)] px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--blue)]/40"
              style={{ borderColor: 'var(--border)' }}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setDenyTarget(null)}>Cancel</Button>
              <Button onClick={submitDeny} disabled={actingOn === denyTarget?.clerk_user_id}>
                {actingOn === denyTarget?.clerk_user_id ? 'Denying…' : 'Deny request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
