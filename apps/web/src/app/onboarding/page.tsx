'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Brand } from '@/components/v3/brand';

interface DiscoverableTeam {
  id: number;
  name: string;
  code: string;
  description: string | null;
  team_code: string | null;
  default_gender: string | null;
}

export default function Onboarding() {
  const router = useRouter();
  const { user } = useUser();

  const [teams, setTeams] = useState<DiscoverableTeam[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection state — either via the browse dropdown OR the code input.
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [codeLookup, setCodeLookup] = useState<DiscoverableTeam | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Athlete identity captured for the request
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // Pre-fill name/email/phone from Clerk
  useEffect(() => {
    if (!user) return;
    if (!name) setName(user.fullName ?? user.firstName ?? '');
    if (!email) setEmail(user.primaryEmailAddress?.emailAddress ?? '');
    if (!phone) {
      const verifiedPhone = user.phoneNumbers?.find((p) => p.verification?.status === 'verified');
      if (verifiedPhone) setPhone(verifiedPhone.phoneNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load browseable teams
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/teams/discover');
      const j = await r.json();
      setTeams(j.teams ?? []);
      setLoading(false);
    })();
  }, []);

  // Code-based lookup. Mostly defers to the API — local validation
  // (isValidTeamCode) is intentionally skipped here so we accept legacy
  // codes like 'uchicago-swim' that don't fit the generator alphabet.
  async function lookupCode() {
    setCodeError(null);
    setCodeLookup(null);
    const lower = code.trim().toLowerCase();
    const r = await fetch(`/api/teams/discover?code=${encodeURIComponent(lower)}`);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setCodeError(j.error === 'team_not_found' ? 'Code not found' : (j.error ?? 'Code not found'));
      return;
    }
    const j = await r.json();
    setCodeLookup(j.team as DiscoverableTeam);
    setPickedId((j.team as DiscoverableTeam).id);
  }

  const selectedTeam =
    codeLookup ?? teams.find((t) => t.id === pickedId) ?? null;

  async function submit() {
    if (!selectedTeam) return;
    setSubmitting(true); setSubmitErr(null);
    const res = await fetch('/api/team-memberships', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: selectedTeam.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      router.push('/dashboard');
      return;
    }
    const j = await res.json().catch(() => ({}));
    setSubmitErr(j.error ?? 'Could not submit request');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-[color:var(--paper)]">
      <div className="w-full max-w-[480px]">
        <div className="mb-10 text-center"><Brand size="lg" /></div>
        <section
          className="rounded-2xl bg-[color:var(--card)] border p-8 shadow-[var(--shadow)]"
          style={{ borderColor: 'var(--border)' }}
        >
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ink)]">Find your team</h1>
          <p className="mt-2 text-[14px] text-[color:var(--ink-mute)]">
            Pick a team you belong to or paste a join code your coach gave you.
            We&rsquo;ll send the request to the team for approval.
          </p>

          {loading ? (
            <p className="mt-6 text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
          ) : (
            <>
              <div className="mt-6 space-y-2">
                <label className="text-[12.5px] font-semibold text-[color:var(--ink)]" htmlFor="team-code">
                  Have a team code?
                </label>
                <div className="flex gap-2">
                  <Input
                    id="team-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. uchicago-swim or k7m2vp"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    onClick={lookupCode}
                    disabled={!code.trim()}
                    variant="ghost"
                  >
                    Find
                  </Button>
                </div>
                {codeError && (
                  <p className="text-[11.5px] text-[color:var(--red)]">{codeError}</p>
                )}
                {codeLookup && (
                  <p className="text-[11.5px] text-[color:var(--green)]">
                    Found <span className="font-semibold">{codeLookup.name}</span>.
                  </p>
                )}
              </div>

              <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wide text-[color:var(--ink-mute)]">
                <span className="flex-1 h-px bg-[color:var(--border)]" />
                <span>or browse</span>
                <span className="flex-1 h-px bg-[color:var(--border)]" />
              </div>

              <div className="space-y-2">
                <label className="text-[12.5px] font-semibold text-[color:var(--ink)]" htmlFor="team-pick">
                  Browse teams
                </label>
                <Select
                  value={pickedId ? String(pickedId) : ''}
                  onValueChange={(v) => { setPickedId(Number(v)); setCodeLookup(null); }}
                >
                  <SelectTrigger id="team-pick" className="h-11">
                    <SelectValue placeholder="Pick a team…" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTeam && (
                <div className="mt-6 space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                    Requesting to join
                  </div>
                  <div className="text-[16px] font-bold text-[color:var(--ink)]">{selectedTeam.name}</div>

                  <div className="grid gap-1.5">
                    <label className="text-[11.5px] font-semibold text-[color:var(--ink)]" htmlFor="name">Your name</label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[11.5px] font-semibold text-[color:var(--ink)]" htmlFor="email">Email</label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[11.5px] font-semibold text-[color:var(--ink)]" htmlFor="phone">Phone</label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 555 555 5555"
                      autoComplete="tel"
                    />
                    <p className="text-[11px] text-[color:var(--ink-mute)]">
                      So your coach can reach you and link you to surveys.
                    </p>
                  </div>
                </div>
              )}

              {submitErr && (
                <p className="mt-4 text-[12.5px] text-[color:var(--red)]">{submitErr}</p>
              )}

              <Button
                onClick={submit}
                disabled={!selectedTeam || !name.trim() || !phone.trim() || submitting}
                className="mt-6 w-full rounded-xl font-bold"
                style={{ background: 'var(--blue)' }}
              >
                {submitting ? 'Sending request…' : 'Request to join →'}
              </Button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
