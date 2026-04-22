'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import type { Team, UserPreferences, WorkerState, Player, UserRole } from '@reflect-live/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, CheckCircle2, AlertCircle } from 'lucide-react';
import { relativeTime, prettyPhone } from '@/lib/format';

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; hint: string }> = [
  { value: 'coach', label: 'Coach', hint: 'See the entire team — all groups, all players.' },
  { value: 'captain', label: 'Captain', hint: 'See your group only (set default group below).' },
  { value: 'athlete', label: 'Athlete', hint: 'See only your own data (pick a player to impersonate).' },
];

export default function SettingsPage() {
  const { role: currentRole, refresh: refreshShell } = useDashboard();
  const sb = useSupabase();
  const { user } = useUser();

  // Phone-OTP flow state
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpMessage, setOtpMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [state, setState] = useState<WorkerState | null>(null);
  const [stats, setStats] = useState<{ players: number; messages: number; activity: number } | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [role, setRole] = useState<UserRole>('coach');
  const [groups, setGroups] = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const canEditRole = currentRole === 'admin';

  async function refresh() {
    const { data: pref } = await sb.from('user_preferences').select('*').maybeSingle();
    if (!pref) return;
    const p = pref as UserPreferences;
    setPrefs(p);
    setGroupFilter(p.group_filter ?? '');
    setRole((p.role as UserRole) ?? 'coach');
    const [{ data: teamData }, { data: ws }, { count: pCount }, { count: mCount }, { count: aCount }, { data: ps }] = await Promise.all([
      sb.from('teams').select('*').eq('id', p.team_id).single(),
      sb.from('worker_state').select('*').eq('id', 1).maybeSingle(),
      sb.from('players').select('id', { count: 'exact', head: true }).eq('team_id', p.team_id),
      sb.from('twilio_messages').select('sid', { count: 'exact', head: true }).eq('team_id', p.team_id),
      sb.from('activity_logs').select('id', { count: 'exact', head: true }).eq('team_id', p.team_id),
      sb.from('players').select('*').eq('team_id', p.team_id).order('name'),
    ]);
    setTeam(teamData as Team);
    setState(ws as WorkerState | null);
    setStats({ players: pCount ?? 0, messages: mCount ?? 0, activity: aCount ?? 0 });
    const players = (ps ?? []) as Player[];
    setAllPlayers(players);
    const groupSet = new Set<string>();
    for (const row of players) if (row.group) groupSet.add(row.group);
    setGroups(Array.from(groupSet).sort());
  }

  useEffect(() => { refresh(); }, [sb]);

  async function save() {
    if (!prefs) return;
    setSaving(true);
    setStatus(null);
    const res = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: prefs.team_id,
        watchlist: prefs.watchlist,
        group_filter: groupFilter || null,
        role: canEditRole ? role : (prefs.role ?? 'coach'),
        impersonate_player_id: role === 'athlete' ? prefs.impersonate_player_id : null,
      }),
    });
    if (res.ok) setStatus('Saved.');
    else setStatus('Error saving.');
    setSaving(false);
    await refresh();
  }

  async function resetWatchlist() {
    if (!prefs) return;
    if (!confirm('Clear your entire watchlist?')) return;
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: prefs.team_id,
        watchlist: [],
        group_filter: prefs.group_filter ?? null,
      }),
    });
    await refresh();
    setStatus('Watchlist cleared.');
  }

  async function setAthlete(playerId: number | null) {
    if (!prefs) return;
    setSaving(true);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: prefs.team_id,
        watchlist: prefs.watchlist,
        group_filter: prefs.group_filter,
        role: playerId ? 'athlete' : role,
        impersonate_player_id: playerId,
      }),
    });
    setSaving(false);
    await refresh();
    setStatus(playerId ? 'Athlete selected.' : 'Athlete cleared.');
  }

  async function requestOtp() {
    setOtpSending(true);
    setOtpMessage(null);
    const res = await fetch('/api/phone/request-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: phoneInput }),
    });
    const json = await res.json();
    setOtpSending(false);
    if (res.ok && json.ok) {
      setOtpSentTo(json.phone);
      setOtpStep('code');
      setOtpMessage({ tone: 'ok', text: `Code sent to ${prettyPhone(json.phone)}. It expires in 10 minutes.` });
    } else {
      setOtpMessage({ tone: 'err', text: json.message ?? json.error ?? 'Could not send code.' });
    }
  }

  async function verifyOtp() {
    setOtpVerifying(true);
    setOtpMessage(null);
    const res = await fetch('/api/phone/verify-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: otpSentTo, code: codeInput }),
    });
    const json = await res.json();
    setOtpVerifying(false);
    if (res.ok && json.ok && json.linked) {
      setOtpMessage({ tone: 'ok', text: `Linked to ${json.player.name}. You now have an athlete view in the sidebar.` });
      setOtpStep('phone');
      setCodeInput('');
      setPhoneInput('');
      setOtpSentTo(null);
      await refresh();
      await refreshShell();
    } else if (res.ok && json.verified && !json.linked) {
      setOtpMessage({ tone: 'err', text: json.message ?? 'Phone verified but not on the team roster. Ask the admin to add you.' });
    } else {
      setOtpMessage({ tone: 'err', text: json.message ?? json.error ?? 'Verification failed.' });
    }
  }

  const lastTwilio = state?.last_twilio_poll_at ? new Date(state.last_twilio_poll_at) : null;
  const lastWeather = state?.last_weather_poll_at ? new Date(state.last_weather_poll_at) : null;
  const impersonatedPlayer = prefs?.impersonate_player_id ? allPlayers.find((p) => p.id === prefs.impersonate_player_id) : null;

  return (
    <>
      <PageHeader title="Settings" />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg">Role / view</CardTitle>
            <CardDescription>
              {canEditRole
                ? 'As an admin, you can try each view to see what other users will see.'
                : `Your view is set to ${currentRole.charAt(0).toUpperCase() + currentRole.slice(1)}. Contact the team admin to change how this page shows up.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEditRole ? (
              <div className="grid gap-3 md:grid-cols-3">
                {ROLE_OPTIONS.map((opt) => {
                  const active = role === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      className={`flex flex-col items-start gap-1 rounded-md border px-4 py-3 text-left transition ${active ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`size-3.5 rounded-full border ${active ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`} />
                        <strong>{opt.label}</strong>
                      </div>
                      <span className="text-xs text-muted-foreground">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Current role</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="default" className="capitalize">{currentRole}</Badge>
                  <span className="text-xs text-muted-foreground">Contact the team admin to change your role.</span>
                </div>
              </div>
            )}

            {canEditRole && role === 'athlete' && (
              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Impersonate player</div>
                <Select
                  value={prefs?.impersonate_player_id ? String(prefs.impersonate_player_id) : ''}
                  onValueChange={(v) => setAthlete(v ? Number(v) : null)}
                >
                  <SelectTrigger className="w-[280px]"><SelectValue placeholder="— select a player —" /></SelectTrigger>
                  <SelectContent>
                    {allPlayers.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.group ?? 'no group'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {impersonatedPlayer && (
                  <div className="text-xs text-muted-foreground">
                    Currently impersonating <strong>{impersonatedPlayer.name}</strong>.{' '}
                    <Link href="/dashboard/athlete" className="text-primary underline underline-offset-4">Open athlete view</Link>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg flex items-center gap-2">
              <Phone className="size-4 text-primary" />
              Link your phone to the roster
            </CardTitle>
            <CardDescription>
              If you&apos;re also a swimmer, verify your phone number and we&apos;ll link it to your roster entry. You keep your current role (e.g. admin) and gain a personal athlete view.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {impersonatedPlayer && (
              <div className="rounded-md border border-[hsl(145_55%_32%)]/30 bg-[hsl(145_55%_32%)]/5 px-3 py-2 text-sm">
                <CheckCircle2 className="inline size-4 text-[hsl(145_55%_32%)] align-[-2px] mr-1" />
                Currently linked to <strong>{impersonatedPlayer.name}</strong>
                {impersonatedPlayer.group && <span className="text-muted-foreground"> · {impersonatedPlayer.group}</span>}.{' '}
                <Link href="/dashboard/athlete" className="text-primary underline underline-offset-4">Open athlete view</Link>
              </div>
            )}

            {otpStep === 'phone' ? (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Phone number</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+1 (321) 406-2958"
                    className="max-w-xs"
                  />
                  <Button onClick={requestOtp} disabled={otpSending || !phoneInput.trim()}>
                    {otpSending ? 'Sending…' : 'Send code'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Include your country code (<span className="font-mono">+1</span>, <span className="font-mono">+61</span>, etc.). We SMS a 6-digit code via the team&apos;s Twilio number.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Code sent to <span className="font-mono text-foreground">{otpSentTo ? prettyPhone(otpSentTo) : '—'}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    className="max-w-[140px] font-mono tabular text-center text-lg tracking-[0.3em]"
                  />
                  <Button onClick={verifyOtp} disabled={otpVerifying || codeInput.length !== 6}>
                    {otpVerifying ? 'Verifying…' : 'Verify & link'}
                  </Button>
                  <Button variant="ghost" onClick={() => { setOtpStep('phone'); setCodeInput(''); setOtpSentTo(null); setOtpMessage(null); }}>
                    Change phone
                  </Button>
                </div>
              </div>
            )}

            {otpMessage && (
              <div className={`rounded-md border px-3 py-2 text-sm ${otpMessage.tone === 'ok'
                  ? 'border-[hsl(145_55%_32%)]/30 bg-[hsl(145_55%_32%)]/5'
                  : 'border-destructive/30 bg-destructive/5'}`}>
                {otpMessage.tone === 'ok'
                  ? <CheckCircle2 className="inline size-4 text-[hsl(145_55%_32%)] align-[-2px] mr-1" />
                  : <AlertCircle className="inline size-4 text-destructive align-[-2px] mr-1" />}
                {otpMessage.text}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">Preferences</CardTitle>
              <CardDescription>Default group filter + watchlist</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Default group filter</div>
                <Select value={groupFilter || 'all'} onValueChange={(v) => setGroupFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">Applies to the dashboard when your role is Captain, or always if you pick one as a Coach.</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</Button>
                <Button variant="outline" onClick={resetWatchlist}>Reset watchlist ({prefs?.watchlist.length ?? 0})</Button>
                {status && <span className="text-xs text-muted-foreground">{status}</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">Account</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[minmax(100px,1fr)_2fr] gap-y-2 gap-x-4 text-sm">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Email</dt>
                <dd>{user?.primaryEmailAddress?.emailAddress ?? '—'}</dd>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Name</dt>
                <dd>{user?.fullName ?? '—'}</dd>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Team</dt>
                <dd>{team?.name ?? '—'} <span className="text-muted-foreground">({team?.code ?? '—'})</span></dd>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Role</dt>
                <dd><Badge variant="default" className="capitalize">{currentRole}</Badge></dd>
              </dl>
              {canEditRole && (
                <details className="mt-4 text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Developer details</summary>
                  <dl className="mt-2 grid grid-cols-[minmax(100px,1fr)_2fr] gap-y-2 gap-x-4">
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground">Clerk ID</dt>
                    <dd className="font-mono text-xs text-muted-foreground break-all">{prefs?.clerk_user_id ?? '—'}</dd>
                  </dl>
                </details>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">Database</CardTitle>
              <CardDescription>Records scoped to your team</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1.5">
                <li><strong>{stats?.players ?? 0}</strong> <span className="text-muted-foreground">players</span></li>
                <li><strong>{stats?.messages ?? 0}</strong> <span className="text-muted-foreground">messages indexed</span></li>
                <li><strong>{stats?.activity ?? 0}</strong> <span className="text-muted-foreground">activity log entries</span></li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="h-serif text-lg">Worker health</CardTitle>
              <CardDescription>Last polls + error state</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1.5">
                <li>Twilio poll: <strong>{relativeTime(lastTwilio)}</strong></li>
                <li>Weather poll: <strong>{relativeTime(lastWeather)}</strong></li>
                <li>Consecutive errors: <strong>{state?.consecutive_errors ?? 0}</strong></li>
                <li>Backfill complete: <strong>{state?.backfill_complete ? 'yes' : 'no'}</strong></li>
                {state?.last_error && <li className="text-xs">Last error: <code>{state.last_error}</code></li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
