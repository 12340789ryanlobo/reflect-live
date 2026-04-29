'use client';

// Coach self-service team creation. POSTs /api/teams. On success:
//   - require_team_approval=false → team is active, creator is coach.
//     Redirect to /dashboard which will pick up the new membership.
//   - require_team_approval=true → team is pending. Show success card
//     with awaiting-approval state. Creator can still see the team in
//     their team switcher (sub-2) since their membership is active.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export default function NewTeamPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [defaultGender, setDefaultGender] = useState<'male' | 'female'>('male');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [pendingState, setPendingState] = useState<{ teamName: string } | null>(null);

  async function submit() {
    setSubmitting(true); setErrMsg(null);
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        default_gender: defaultGender,
        description: description.trim() || null,
      }),
    });
    setSubmitting(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrMsg(
        j.error === 'code_taken' ? 'A team with a similar name already exists. Try another name.'
        : j.error === 'name_required' ? 'Name is required.'
        : j.error === 'name_too_long' ? 'Name is too long.'
        : (j.error ?? 'Could not create team.'),
      );
      return;
    }
    if (j.requires_approval) {
      setPendingState({ teamName: j.team?.name ?? name });
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  if (pendingState) {
    return (
      <>
        <PageHeader eyebrow="Team" title="Awaiting approval" />
        <main className="px-6 py-10">
          <section
            className="mx-auto max-w-[480px] rounded-2xl bg-[color:var(--card)] border px-6 py-8 text-center"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2 className="text-[18px] font-bold text-[color:var(--ink)]">
              {pendingState.teamName} is awaiting platform admin approval
            </h2>
            <p className="mt-2 text-[13px] text-[color:var(--ink-mute)]">
              You&rsquo;ll be able to invite athletes and start using the team once an
              admin approves it. We&rsquo;ll surface a notification when that happens.
            </p>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Team" title="Create a team" />
      <main className="px-6 py-6">
        <section
          className="mx-auto max-w-[480px] rounded-2xl bg-[color:var(--card)] border p-6 space-y-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="t-name">Team name</label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. UChicago Men&rsquo;s Swim"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="t-gender">Default heatmap figure</label>
            <Select value={defaultGender} onValueChange={(v) => setDefaultGender(v as 'male' | 'female')}>
              <SelectTrigger id="t-gender"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="t-desc">Description (optional)</label>
            <Input
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything you want athletes to see when they find your team."
            />
          </div>
          {errMsg && <p className="text-[12.5px] text-[color:var(--red)]">{errMsg}</p>}
          <div className="flex justify-end pt-2">
            <Button onClick={submit} disabled={!name.trim() || submitting}>
              {submitting ? 'Creating…' : 'Create team'}
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
