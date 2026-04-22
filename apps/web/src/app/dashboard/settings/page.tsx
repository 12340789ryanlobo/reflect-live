'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
import { useSupabase } from '@/lib/supabase-browser';
import type { Team, UserPreferences, WorkerState, Player, UserRole } from '@reflect-live/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Phone, CheckCircle2, AlertCircle } from 'lucide-react';
import { relativeTime, prettyPhone } from '@/lib/format';

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; hint: string; tone: 'flag' | 'live' | 'watch' | 'on' }> = [
  { value: 'coach',   label: 'Coach',   hint: 'See the entire team — all groups, all players.', tone: 'live' },
  { value: 'captain', label: 'Captain', hint: 'See your group only (set default group below).',  tone: 'watch' },
  { value: 'athlete', label: 'Athlete', hint: 'See only your own data (pick a player to impersonate).', tone: 'on' },
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
      {children}
    </label>
  );
}

export default function SettingsPage() {
  const { role: currentRole, refresh: refreshShell } = useDashboard();
  const sb = useSupabase();
  const { user } = useUser();

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
    const [
      { data: teamData },
      { data: ws },
      { count: pCount },
      { count: mCount },
      { count: aCount },
      { data: ps },
    ] = await Promise.all([
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

  useEffect(() => {
    refresh();
  }, [sb]);

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
        role: canEditRole ? role : prefs.role ?? 'coach',
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
      const via = json.channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
      setOtpMessage({
        tone: 'ok',
        text: `Code sent via ${via} to ${prettyPhone(json.phone)}. It expires in 10 minutes.`,
      });
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
      setOtpMessage({
        tone: 'ok',
        text: `Linked to ${json.player.name}. You now have an athlete view in the sidebar.`,
      });
      setOtpStep('phone');
      setCodeInput('');
      setPhoneInput('');
      setOtpSentTo(null);
      await refresh();
      await refreshShell();
    } else if (res.ok && json.verified && !json.linked) {
      setOtpMessage({
        tone: 'err',
        text: json.message ?? 'Phone verified but not on the team roster. Ask the admin to add you.',
      });
    } else {
      setOtpMessage({ tone: 'err', text: json.message ?? json.error ?? 'Verification failed.' });
    }
  }

  const lastTwilio = state?.last_twilio_poll_at ? new Date(state.last_twilio_poll_at) : null;
  const lastWeather = state?.last_weather_poll_at ? new Date(state.last_weather_poll_at) : null;
  const impersonatedPlayer = prefs?.impersonate_player_id
    ? allPlayers.find((p) => p.id === prefs.impersonate_player_id)
    : null;

  return (
    <>
      <PageHeader
        code="SET"
        eyebrow="Settings"
        title="Settings"
        subtitle="PROFILE · PREFERENCES · TELEMETRY"
      />

      <main className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        {/* Role */}
        <section className="reveal reveal-1 panel p-5">
          <SectionTag
            code="S1"
            name="Role / view"
            right={<Stamp tone={ROLE_OPTIONS.find((r) => r.value === currentRole)?.tone ?? 'on'}>{currentRole}</Stamp>}
          />
          <p className="mt-2 text-sm text-[color:var(--bone-soft)] leading-relaxed">
            {canEditRole
              ? 'As an admin, you can try each view to see what other users will see.'
              : `Your view is set to ${currentRole}. Contact the team admin to change how the page shows up.`}
          </p>

          {canEditRole ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {ROLE_OPTIONS.map((opt) => {
                const active = role === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className={`flex flex-col gap-2 rounded-sm border px-4 py-3 text-left transition ${
                      active
                        ? 'border-[color:var(--signal)] bg-[color:var(--signal-ghost)]'
                        : 'border-[color:var(--hairline)] hover:border-[color:var(--signal)]/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-3 rounded-full border ${active ? 'border-[color:var(--signal)] bg-[color:var(--signal)]' : 'border-[color:var(--bone-dim)]'}`}
                      />
                      <span className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--bone)]">
                        {opt.label}
                      </span>
                    </div>
                    <span className="text-xs text-[color:var(--bone-mute)]">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {canEditRole && role === 'athlete' && (
            <div className="mt-5 space-y-2">
              <Label>Impersonate athlete</Label>
              <Select
                value={prefs?.impersonate_player_id ? String(prefs.impersonate_player_id) : ''}
                onValueChange={(v) => setAthlete(v ? Number(v) : null)}
              >
                <SelectTrigger className="w-[280px] h-9">
                  <SelectValue placeholder="— select an athlete —" />
                </SelectTrigger>
                <SelectContent>
                  {allPlayers.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} ({p.group ?? 'no group'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {impersonatedPlayer && (
                <div className="mono text-[0.72rem] text-[color:var(--bone-mute)]">
                  simulating <strong className="text-[color:var(--bone)]">{impersonatedPlayer.name}</strong>.{' '}
                  <Link
                    href="/dashboard/athlete"
                    className="text-[color:var(--signal)] hover:underline underline-offset-4"
                  >
                    open your lane →
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Phone link */}
        <section className="reveal reveal-2 panel p-5">
          <SectionTag
            code="S2"
            name="Link your phone to the roster"
            right={<Phone className="size-4 text-[color:var(--signal)]" />}
          />
          <p className="mt-2 text-sm text-[color:var(--bone-soft)] leading-relaxed">
            If you&rsquo;re also an athlete, verify your number and we&rsquo;ll link it to your roster
            entry. You keep your current role and gain a personal &ldquo;your lane&rdquo; view.
          </p>

          <div className="mt-5 space-y-4">
            {impersonatedPlayer && (
              <div
                className="flex items-start gap-3 rounded-sm border px-4 py-3 text-sm"
                style={{
                  borderColor: 'hsl(162 40% 40%)',
                  background: 'hsl(162 40% 18% / 0.3)',
                }}
              >
                <CheckCircle2 className="size-4 text-[color:var(--chlorine)] mt-0.5 shrink-0" />
                <div>
                  Currently linked to <strong>{impersonatedPlayer.name}</strong>
                  {impersonatedPlayer.group && (
                    <span className="text-[color:var(--bone-mute)]"> · {impersonatedPlayer.group}</span>
                  )}
                  .{' '}
                  <Link
                    href="/dashboard/athlete"
                    className="text-[color:var(--signal)] hover:underline underline-offset-4"
                  >
                    open your lane →
                  </Link>
                </div>
              </div>
            )}

            {otpStep === 'phone' ? (
              <div className="space-y-2">
                <Label>Phone number</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+1 (321) 406-2958"
                    className="mono max-w-xs"
                  />
                  <Button
                    onClick={requestOtp}
                    disabled={otpSending || !phoneInput.trim()}
                    className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em]"
                  >
                    {otpSending ? 'Sending…' : 'Send code'}
                  </Button>
                </div>
                <p className="mono text-[0.68rem] text-[color:var(--bone-mute)] leading-relaxed">
                  Include your country code (+1, +61, etc.). We SMS a 6-digit code via the team&rsquo;s
                  Twilio number.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>
                  CODE SENT TO{' '}
                  <span className="text-[color:var(--bone)]">
                    {otpSentTo ? prettyPhone(otpSentTo) : '—'}
                  </span>
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    className="mono max-w-[140px] text-center text-lg tracking-[0.3em]"
                  />
                  <Button
                    onClick={verifyOtp}
                    disabled={otpVerifying || codeInput.length !== 6}
                    className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em]"
                  >
                    {otpVerifying ? 'Verifying…' : 'Verify & link'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setOtpStep('phone');
                      setCodeInput('');
                      setOtpSentTo(null);
                      setOtpMessage(null);
                    }}
                    className="mono text-[0.7rem] uppercase tracking-[0.18em]"
                  >
                    Change phone
                  </Button>
                </div>
              </div>
            )}

            {otpMessage && (
              <div
                className="flex items-start gap-2 rounded-sm border px-3 py-2 text-sm"
                style={{
                  borderColor: otpMessage.tone === 'ok' ? 'hsl(162 40% 40%)' : 'hsl(356 60% 42%)',
                  background: otpMessage.tone === 'ok' ? 'hsl(162 40% 18% / 0.3)' : 'hsl(356 60% 22% / 0.3)',
                }}
              >
                {otpMessage.tone === 'ok' ? (
                  <CheckCircle2 className="size-4 text-[color:var(--chlorine)] mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 text-[color:var(--siren)] mt-0.5 shrink-0" />
                )}
                {otpMessage.text}
              </div>
            )}
          </div>
        </section>

        {/* Prefs + account */}
        <section className="reveal reveal-3 grid gap-6 lg:grid-cols-2">
          <div className="panel p-5">
            <SectionTag code="S3" name="Preferences" />
            <p className="mt-2 text-xs text-[color:var(--bone-mute)]">
              Default group filter + watchlist management.
            </p>
            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label>Default group filter</Label>
                <Select
                  value={groupFilter || 'all'}
                  onValueChange={(v) => setGroupFilter(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mono text-[0.66rem] text-[color:var(--bone-mute)]">
                  Applies when your role is captain, or always if you pick one as coach.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={save}
                  disabled={saving}
                  className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em]"
                >
                  {saving ? 'Saving…' : 'Save preferences'}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetWatchlist}
                  className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em]"
                >
                  Reset watchlist ({prefs?.watchlist.length ?? 0})
                </Button>
                {status && (
                  <span className="mono text-[0.68rem] uppercase tracking-[0.2em] text-[color:var(--bone-mute)]">
                    {status}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <SectionTag code="S4" name="Account" />
            <dl className="mt-5 grid grid-cols-[100px_1fr] gap-y-2 gap-x-4 text-sm">
              <Dt>Email</Dt>
              <Dd mono>{user?.primaryEmailAddress?.emailAddress ?? '—'}</Dd>
              <Dt>Name</Dt>
              <Dd>{user?.fullName ?? '—'}</Dd>
              <Dt>Team</Dt>
              <Dd>
                {team?.name ?? '—'}{' '}
                <span className="text-[color:var(--bone-mute)] mono">({team?.code ?? '—'})</span>
              </Dd>
              <Dt>Role</Dt>
              <Dd>
                <Stamp tone={ROLE_OPTIONS.find((r) => r.value === currentRole)?.tone ?? 'on'}>
                  {currentRole}
                </Stamp>
              </Dd>
            </dl>
            {canEditRole && (
              <details className="mt-5 text-xs">
                <summary className="cursor-pointer mono uppercase tracking-[0.2em] text-[0.66rem] text-[color:var(--bone-mute)] hover:text-[color:var(--bone)]">
                  Developer details
                </summary>
                <dl className="mt-2 grid grid-cols-[100px_1fr] gap-y-2 gap-x-4">
                  <Dt>Clerk ID</Dt>
                  <Dd mono>
                    <span className="text-[color:var(--bone-mute)] break-all">
                      {prefs?.clerk_user_id ?? '—'}
                    </span>
                  </Dd>
                </dl>
              </details>
            )}
          </div>
        </section>

        {/* Database + worker */}
        <section className="reveal reveal-4 grid gap-6 lg:grid-cols-2">
          <div className="panel p-5">
            <SectionTag code="S5" name="Database" />
            <p className="mt-2 text-xs text-[color:var(--bone-mute)]">Records scoped to your team.</p>
            <ul className="mt-4 space-y-2">
              <KV label="Athletes" value={stats?.players ?? 0} tone="heritage" />
              <KV label="Messages indexed" value={stats?.messages ?? 0} tone="signal" />
              <KV label="Activity log entries" value={stats?.activity ?? 0} tone="chlorine" />
            </ul>
          </div>
          <div className="panel p-5">
            <SectionTag code="S6" name="Worker health" />
            <p className="mt-2 text-xs text-[color:var(--bone-mute)]">Last polls and error state.</p>
            <ul className="mt-4 space-y-2">
              <KV label="Twilio poll" value={relativeTime(lastTwilio)} mono />
              <KV label="Weather poll" value={relativeTime(lastWeather)} mono />
              <KV
                label="Consecutive errors"
                value={state?.consecutive_errors ?? 0}
                tone={(state?.consecutive_errors ?? 0) > 0 ? 'siren' : 'chlorine'}
              />
              <KV label="Backfill" value={state?.backfill_complete ? 'complete' : 'in progress'} mono />
              {state?.last_error && (
                <li className="mono text-[0.68rem] text-[color:var(--siren)] leading-snug mt-2">
                  <span className="text-[color:var(--bone-dim)] uppercase tracking-[0.16em]">Last error: </span>
                  {state.last_error}
                </li>
              )}
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return (
    <dt className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)] py-1">
      {children}
    </dt>
  );
}
function Dd({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <dd className={`py-1 text-[color:var(--bone)] ${mono ? 'mono text-xs' : ''}`}>{children}</dd>
  );
}
function KV({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  tone?: 'heritage' | 'signal' | 'chlorine' | 'siren';
}) {
  const color = tone
    ? {
        heritage: 'hsl(358 78% 58%)',
        signal: 'hsl(188 82% 58%)',
        chlorine: 'hsl(162 62% 54%)',
        siren: 'hsl(356 82% 62%)',
      }[tone]
    : 'var(--bone)';
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-dashed border-[color:var(--hairline)] pb-2 last:border-0 last:pb-0">
      <span className="mono text-[0.66rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
        {label}
      </span>
      <span
        className={`${mono ? 'mono' : 'num-display'} text-sm font-semibold tabular`}
        style={{ color }}
      >
        {value}
      </span>
    </li>
  );
}
