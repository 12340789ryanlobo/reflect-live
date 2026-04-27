'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brand } from '@/components/v3/brand';

interface TeamPub { id: number; name: string; code: string; description: string | null; }

export default function Onboarding() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamPub[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/teams-public');
      const j = await r.json();
      const ts = j.teams ?? [];
      setTeams(ts);
      if (ts.length === 1) setPickedId(ts[0].id);
      setLoading(false);
    })();
  }, []);

  async function save() {
    if (!pickedId) return;
    setSaving(true);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ team_id: pickedId, watchlist: [], group_filter: null }),
    });
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-[color:var(--paper)]">
      <div className="w-full max-w-[480px]">
        <div className="mb-10 text-center"><Brand size="lg" /></div>
        <section className="rounded-2xl bg-[color:var(--card)] border p-8 shadow-[var(--shadow)]" style={{ borderColor: 'var(--border)' }}>
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ink)]">Welcome</h1>
          <p className="mt-2 text-[14px] text-[color:var(--ink-mute)]">Pick the team you belong to. Your role is assigned by your team admin.</p>

          {loading ? (
            <p className="mt-6 text-[13px] text-[color:var(--ink-mute)]">Loading teams…</p>
          ) : teams.length === 0 ? (
            <p className="mt-6 text-[13px] text-[color:var(--ink-mute)]">No teams yet — contact your admin.</p>
          ) : teams.length === 1 ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Your team</div>
                <div className="mt-1 text-[18px] font-bold text-[color:var(--ink)]">{teams[0].name}</div>
                {teams[0].description && (
                  <div className="mt-2 text-[13px] text-[color:var(--ink-mute)]">{teams[0].description}</div>
                )}
              </div>
              <Button
                onClick={save}
                disabled={saving}
                className="w-full rounded-xl font-bold"
                style={{ background: 'var(--blue)' }}
              >
                {saving ? 'Setting up…' : `Join ${teams[0].name} →`}
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <Select value={pickedId ? String(pickedId) : ''} onValueChange={(v) => setPickedId(Number(v))}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Pick your team…" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                onClick={save}
                disabled={saving || !pickedId}
                className="w-full rounded-xl font-bold"
                style={{ background: 'var(--blue)' }}
              >
                {saving ? 'Setting up…' : 'Continue →'}
              </Button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
