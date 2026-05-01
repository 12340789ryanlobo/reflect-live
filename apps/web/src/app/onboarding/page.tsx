'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
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

  // Athlete identity captured for the request. Email is sourced from
  // Clerk and not editable — Clerk owns auth identity, the server
  // re-reads it from currentUser() on submit so a tampered body is
  // ignored anyway. `phone` is whatever react-phone-number-input
  // produces — already E.164 (e.g. '+15551234567') or undefined.
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const clerkEmail = user?.primaryEmailAddress?.emailAddress ?? '';

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // Pre-fill name + phone from Clerk on first render.
  useEffect(() => {
    if (!user) return;
    if (!name) setName(user.fullName ?? user.firstName ?? '');
    if (!phone) {
      const verifiedPhone = user.phoneNumbers?.find((p) => p.verification?.status === 'verified');
      if (verifiedPhone?.phoneNumber) setPhone(verifiedPhone.phoneNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // The library returns undefined while empty, the country E.164 once
  // valid digits start appearing, but only `isValidPhoneNumber` confirms
  // the digit count fits the selected country (e.g. exactly 10 for US).
  const phoneEmpty = !phone;
  const phoneValid = !!phone && isValidPhoneNumber(phone);
  const phoneInvalid = !phoneEmpty && !phoneValid;

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
    if (!phone || !phoneValid) {
      setSubmitErr('Enter a valid phone number for the selected country.');
      return;
    }
    setSubmitting(true); setSubmitErr(null);
    const res = await fetch('/api/team-memberships', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: selectedTeam.id,
        name: name.trim(),
        // email is intentionally omitted — server pulls from Clerk.
        // phone is already E.164 from react-phone-number-input.
        phone,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      router.push('/dashboard');
      return;
    }
    const j = await res.json().catch(() => ({}));
    setSubmitErr(j.detail ?? j.error ?? 'Could not submit request');
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
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[11.5px] font-semibold text-[color:var(--ink)]" htmlFor="email">
                      Email <span className="text-[color:var(--ink-mute)] font-normal">(from your account)</span>
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={clerkEmail}
                      readOnly
                      disabled
                      className="cursor-not-allowed bg-[color:var(--paper-2)]"
                    />
                    <p className="text-[11px] text-[color:var(--ink-mute)]">
                      Locked to your sign-in email. Change it via your account settings if needed.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-[11.5px] font-semibold text-[color:var(--ink)]" htmlFor="phone">Phone</label>
                    <PhoneInput
                      id="phone"
                      international
                      defaultCountry="US"
                      countryCallingCodeEditable={false}
                      value={phone}
                      onChange={(v) => setPhone(v)}
                      placeholder="555 123 4567"
                      autoComplete="tel"
                      className="phone-input"
                      data-invalid={phoneInvalid ? 'true' : undefined}
                    />
                    {phoneInvalid ? (
                      <p className="text-[11px]" style={{ color: 'var(--red)' }}>
                        Number doesn&rsquo;t fit the selected country&rsquo;s format. Pick the
                        right country flag and the field will only accept the right digit count.
                      </p>
                    ) : phoneValid ? (
                      <p className="text-[11px] text-[color:var(--ink-mute)]">
                        Will be saved as <span className="mono text-[color:var(--ink-soft)]">{phone}</span>.
                      </p>
                    ) : (
                      <p className="text-[11px] text-[color:var(--ink-mute)]">
                        Pick your country, then type only the local number. So your coach
                        can reach you and link you to surveys.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {submitErr && (
                <p className="mt-4 text-[12.5px] text-[color:var(--red)]">{submitErr}</p>
              )}

              <Button
                onClick={submit}
                disabled={!selectedTeam || !name.trim() || !phoneValid || submitting}
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
