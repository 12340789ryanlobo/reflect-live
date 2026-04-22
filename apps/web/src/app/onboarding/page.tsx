'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--paper)] px-6 py-10 text-[var(--ink)]">
      {/* Ambient lanes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-60"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 22px, hsl(188 72% 42% / 0.09) 22px, hsl(188 72% 42% / 0.09) 23px)',
        }}
      />

      <div className="relative grid w-full max-w-3xl grid-cols-1 gap-10 lg:grid-cols-5 lg:gap-12">
        {/* Editorial intro */}
        <div className="reveal reveal-1 lg:col-span-2 lg:pt-6">
          <div className="mb-5 flex items-center gap-3">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: 'var(--pool)', boxShadow: '0 0 0 4px hsl(188 72% 42% / 0.18)' }}
            />
            <span className="eyebrow">Ch. 01 · Enroll</span>
          </div>
          <h1 className="h-display text-5xl leading-[0.95] md:text-6xl">
            Welcome,{' '}
            <span className="h-display-italic" style={{ color: 'var(--maroon)' }}>
              recruit.
            </span>
          </h1>
          <p className="mt-6 font-serif text-lg leading-relaxed text-[var(--ink-soft)]">
            Pick the team you belong to. Your role — coach, captain, or athlete — is assigned
            by your team admin once you&rsquo;re in.
          </p>
          <div
            aria-hidden
            className="mt-8 h-[3px] w-24"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to right, var(--maroon) 0, var(--maroon) 12px, transparent 12px, transparent 20px)',
            }}
          />
        </div>

        {/* Team picker card */}
        <div className="reveal reveal-3 lg:col-span-3">
          <div
            className="relative border-t-[3px] bg-white px-6 py-7 shadow-[0_18px_48px_hsl(220_22%_10%_/_0.08)] md:px-8 md:py-9"
            style={{ borderColor: 'var(--maroon)' }}
          >
            <div className="eyebrow mb-4">Roster · Team Selection</div>

            {loading ? (
              <p className="mono text-sm text-[var(--ink-mute)]">Loading teams…</p>
            ) : teams.length === 0 ? (
              <div className="space-y-3">
                <h2 className="h-serif text-xl font-semibold">No teams yet.</h2>
                <p className="text-sm text-[var(--ink-soft)]">
                  Contact your admin to spin one up, then come back here.
                </p>
              </div>
            ) : teams.length === 1 ? (
              <>
                <div className="mb-6 border-y border-dashed border-[hsl(30_18%_82%)] py-4">
                  <div className="eyebrow mb-2">Your team</div>
                  <div className="h-serif text-2xl font-semibold leading-tight">
                    {teams[0].name}
                  </div>
                  {teams[0].description && (
                    <div className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
                      {teams[0].description}
                    </div>
                  )}
                </div>
                <Button
                  onClick={save}
                  disabled={saving}
                  className="w-full rounded-sm py-5 text-[0.95rem] font-semibold"
                  style={{ background: 'var(--maroon)' }}
                >
                  {saving ? 'Setting up…' : `Join ${teams[0].name} →`}
                </Button>
              </>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="eyebrow mb-2 block">Choose</label>
                  <Select
                    value={pickedId ? String(pickedId) : ''}
                    onValueChange={(v) => setPickedId(Number(v))}
                  >
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder="Pick your team…" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={save}
                  disabled={saving || !pickedId}
                  className="w-full rounded-sm py-5 text-[0.95rem] font-semibold"
                  style={{ background: 'var(--maroon)' }}
                >
                  {saving ? 'Setting up…' : 'Continue →'}
                </Button>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="eyebrow">Fig. 1 — Roster</span>
            <span className="mono text-[0.72rem] text-[var(--ink-mute)]">step 1 of 1</span>
          </div>
        </div>
      </div>
    </main>
  );
}
