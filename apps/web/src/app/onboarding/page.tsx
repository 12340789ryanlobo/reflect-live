'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BrandMark, Wordmark } from '@/components/brand-mark';
import { SectionTag } from '@/components/section-tag';

interface TeamPub {
  id: number;
  name: string;
  code: string;
  description: string | null;
}

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

  const pickedTeam = pickedId ? teams.find((t) => t.id === pickedId) : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10 text-[color:var(--bone)]">
      {/* Top broadcast rail */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: 'linear-gradient(to right, transparent, hsl(188 82% 58%), transparent)' }}
      />

      <div className="relative grid w-full max-w-5xl grid-cols-1 gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        {/* Editorial intro */}
        <div className="reveal reveal-1 lg:pt-6">
          <Wordmark size={28} tone="bone" />
          <div className="mt-10 flex items-center gap-3">
            <span className="station-code">CH · 01</span>
            <span className="eyebrow">Enroll</span>
          </div>
          <h1 className="h-display mt-4 text-6xl leading-[0.9]">
            Welcome,{' '}
            <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
              recruit.
            </span>
          </h1>
          <p className="mt-8 max-w-md font-serif text-lg leading-relaxed text-[color:var(--bone-soft)]">
            Pick the team you belong to. Your role — coach, captain, or athlete — is assigned by
            your team admin once you&rsquo;re inside.
          </p>
          <div className="mt-10 flex items-center gap-3 text-[color:var(--bone-dim)]">
            <BrandMark size={20} tone="heritage" />
            <span className="mono text-[0.66rem] uppercase tracking-[0.22em]">
              Step 01 of 01 · Enrollment
            </span>
          </div>
        </div>

        {/* Team picker card */}
        <div className="reveal reveal-3">
          <div className="panel overflow-hidden">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag name="Team selection" />
            </div>
            <div className="p-6">
              {loading ? (
                <p className="mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
                  — loading teams —
                </p>
              ) : teams.length === 0 ? (
                <div className="space-y-3">
                  <h2 className="h-serif text-2xl font-semibold">No teams yet.</h2>
                  <p className="text-sm text-[color:var(--bone-mute)] leading-relaxed">
                    Contact your admin to spin one up, then come back here.
                  </p>
                </div>
              ) : teams.length === 1 ? (
                <div className="space-y-6">
                  <div className="border-y border-dashed border-[color:var(--hairline)] py-5">
                    <div className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                      Your team
                    </div>
                    <div className="h-display mt-3 text-3xl font-semibold leading-tight">
                      {teams[0].name}
                    </div>
                    {teams[0].description && (
                      <div className="mt-3 text-sm leading-relaxed text-[color:var(--bone-soft)]">
                        {teams[0].description}
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-3 mono text-[0.66rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                      <span>Code · {teams[0].code}</span>
                      <span>·</span>
                      <span>ID · {String(teams[0].id).padStart(3, '0')}</span>
                    </div>
                  </div>
                  <Button
                    onClick={save}
                    disabled={saving}
                    className="w-full mono text-[0.75rem] font-semibold uppercase tracking-[0.22em] rounded-sm py-5"
                    style={{ background: 'var(--heritage)' }}
                  >
                    {saving ? 'Setting up…' : `Join ${teams[0].name} →`}
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                      Choose
                    </label>
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
                  {pickedTeam && (
                    <div className="border-y border-dashed border-[color:var(--hairline)] py-4">
                      <div className="h-serif text-xl font-semibold">{pickedTeam.name}</div>
                      {pickedTeam.description && (
                        <div className="mt-2 text-sm text-[color:var(--bone-mute)]">
                          {pickedTeam.description}
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={save}
                    disabled={saving || !pickedId}
                    className="w-full mono text-[0.75rem] font-semibold uppercase tracking-[0.22em] rounded-sm py-5"
                    style={{ background: 'var(--heritage)' }}
                  >
                    {saving ? 'Setting up…' : 'Continue →'}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
            <span>Fig. 01 — Roster</span>
            <span>β 0.1</span>
          </div>
        </div>
      </div>
    </main>
  );
}
