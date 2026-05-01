'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Pill } from '@/components/v3/pill';
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

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; hint: string; tone: 'red' | 'blue' | 'amber' | 'green' }> = [
  { value: 'coach',   label: 'Coach',   hint: 'See the entire team — all groups, all players.', tone: 'blue' },
  { value: 'captain', label: 'Captain', hint: 'See your group only (set default group below).',  tone: 'amber' },
  { value: 'athlete', label: 'Athlete', hint: 'See only your own data (pick a player to impersonate).', tone: 'green' },
];

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">{children}</label>;
}
function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] py-1">{children}</dt>;
}
function Dd({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <dd className={`py-1 text-[color:var(--ink)] ${mono ? 'mono text-[12px]' : 'text-[14px]'}`}>{children}</dd>;
}
function KV({ label, value, mono, tone }: { label: string; value: React.ReactNode; mono?: boolean; tone?: 'blue' | 'green' | 'red' | 'amber' }) {
  const color = tone === 'blue' ? 'var(--blue)' : tone === 'green' ? 'var(--green)' : tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--ink)';
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-dashed pb-2 last:border-0 last:pb-0" style={{ borderColor: 'var(--border)' }}>
      <span className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">{label}</span>
      <span className={`${mono ? 'mono' : 'tabular'} text-[14px] font-semibold`} style={{ color }}>{value}</span>
    </li>
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
  const canConfigureScoring = currentRole === 'coach' || currentRole === 'admin';
  const [workoutScore, setWorkoutScore] = useState<string>('1.0');
  const [rehabScore, setRehabScore] = useState<string>('0.5');
  const [scoringSaving, setScoringSaving] = useState(false);
  const [scoringStatus, setScoringStatus] = useState<string | null>(null);
  const [genderSaving, setGenderSaving] = useState(false);
  const [genderStatus, setGenderStatus] = useState<string | null>(null);
  const [meGenderSaving, setMeGenderSaving] = useState(false);
  const [meGenderStatus, setMeGenderStatus] = useState<string | null>(null);
  const [captainPermsSaving, setCaptainPermsSaving] = useState(false);
  const [captainPermsStatus, setCaptainPermsStatus] = useState<string | null>(null);
  const [seasonStartInput, setSeasonStartInput] = useState<string>('');
  const [seasonSaving, setSeasonSaving] = useState(false);
  const [seasonStatus, setSeasonStatus] = useState<string | null>(null);

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
    const sc = (teamData as Team)?.scoring_json;
    if (sc) {
      setWorkoutScore(String(sc.workout_score ?? 1.0));
      setRehabScore(String(sc.rehab_score ?? 0.5));
    }
    setSeasonStartInput((teamData as Team)?.competition_start_date ?? '');
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

  async function saveScoring() {
    setScoringSaving(true);
    setScoringStatus(null);
    const ws = Number(workoutScore);
    const rs = Number(rehabScore);
    if (!Number.isFinite(ws) || ws < 0 || !Number.isFinite(rs) || rs < 0) {
      setScoringStatus('Values must be non-negative numbers.');
      setScoringSaving(false);
      return;
    }
    const res = await fetch('/api/team/scoring', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workout_score: ws, rehab_score: rs }),
    });
    if (res.ok) {
      setScoringStatus('Saved.');
      await refresh();
      await refreshShell();
    } else {
      const j = await res.json().catch(() => ({}));
      setScoringStatus(j.error ? `Error: ${j.error}` : 'Save failed.');
    }
    setScoringSaving(false);
  }

  async function saveGender(next: 'male' | 'female') {
    setGenderSaving(true);
    setGenderStatus(null);
    const res = await fetch('/api/team/gender', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ default_gender: next }),
    });
    if (res.ok) {
      setGenderStatus('Saved.');
      await refresh();
      await refreshShell();
      setTimeout(() => setGenderStatus(null), 2000);
    } else {
      const j = await res.json().catch(() => ({}));
      setGenderStatus(j.error ? `Error: ${j.error}` : 'Save failed.');
    }
    setGenderSaving(false);
  }

  async function saveCaptainCanViewSessions(next: boolean) {
    if (!team) return;
    setCaptainPermsSaving(true);
    setCaptainPermsStatus(null);
    const res = await fetch(`/api/teams/${team.id}/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ captain_can_view_sessions: next }),
    });
    if (res.ok) {
      setCaptainPermsStatus('Saved.');
      await refresh();
      await refreshShell();
      setTimeout(() => setCaptainPermsStatus(null), 2000);
    } else {
      const j = await res.json().catch(() => ({}));
      setCaptainPermsStatus(j.error ? `Error: ${j.error}` : 'Save failed.');
    }
    setCaptainPermsSaving(false);
  }

  async function saveSeasonStart(next: string | null) {
    if (!team) return;
    setSeasonSaving(true);
    setSeasonStatus(null);
    const res = await fetch(`/api/teams/${team.id}/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ competition_start_date: next }),
    });
    if (res.ok) {
      setSeasonStatus('Saved.');
      await refresh();
      await refreshShell();
      setTimeout(() => setSeasonStatus(null), 2000);
    } else {
      const j = await res.json().catch(() => ({}));
      setSeasonStatus(j.error ? `Error: ${j.error}` : 'Save failed.');
    }
    setSeasonSaving(false);
  }

  async function saveMyGender(next: 'male' | 'female' | null) {
    setMeGenderSaving(true);
    setMeGenderStatus(null);
    const res = await fetch('/api/me/gender', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gender: next }),
    });
    setMeGenderSaving(false);
    if (res.ok) {
      setMeGenderStatus('Saved.');
      await refresh();
      setTimeout(() => setMeGenderStatus(null), 2000);
    } else {
      const j = await res.json().catch(() => ({}));
      setMeGenderStatus(j.error ? `Error: ${j.error}` : 'Save failed.');
    }
  }

  async function setRoleAndSave(newRole: UserRole) {
    if (!prefs) return;
    if (newRole === role) return;
    setRole(newRole);
    setStatus(`Switching to ${newRole.charAt(0).toUpperCase() + newRole.slice(1)} view…`);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: prefs.team_id,
        watchlist: prefs.watchlist,
        group_filter: prefs.group_filter,
        role: newRole,
        impersonate_player_id: newRole === 'athlete' ? prefs.impersonate_player_id : null,
      }),
    });
    await refresh();
    await refreshShell();
    setStatus(`Switched to ${newRole.charAt(0).toUpperCase() + newRole.slice(1)} view.`);
    setTimeout(() => setStatus(null), 2200);
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

  const roleTone = ROLE_OPTIONS.find((r) => r.value === currentRole)?.tone ?? 'green';

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Role / view */}
        {canEditRole && (
          <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-base font-bold text-[color:var(--ink)]">Role / view</h2>
              <Pill tone={roleTone}>{currentRole}</Pill>
            </div>
            <p className="text-[13px] text-[color:var(--ink-mute)] leading-relaxed mb-5">
              As an admin, you can try each view to see what other users will see.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {ROLE_OPTIONS.map((opt) => {
                const active = role === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRoleAndSave(opt.value)}
                    disabled={status?.startsWith('Switching')}
                    className="flex flex-col gap-2 rounded-xl border px-4 py-3 text-left transition"
                    style={{
                      borderColor: active ? 'var(--blue)' : 'var(--border)',
                      background: active ? 'color-mix(in srgb, var(--blue) 8%, transparent)' : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-full border"
                        style={{
                          borderColor: active ? 'var(--blue)' : 'var(--ink-dim)',
                          background: active ? 'var(--blue)' : undefined,
                        }}
                      />
                      <span className="text-[13px] font-semibold text-[color:var(--ink)]">{opt.label}</span>
                    </div>
                    <span className="text-[12px] text-[color:var(--ink-mute)]">{opt.hint}</span>
                  </button>
                );
              })}
            </div>

            {role === 'athlete' && (
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
                  <div className="text-[12px] text-[color:var(--ink-mute)]">
                    currently simulating <strong className="text-[color:var(--ink)]">{impersonatedPlayer.name}</strong>.{' '}
                    <Link
                      href="/dashboard/athlete"
                      className="underline underline-offset-4"
                      style={{ color: 'var(--blue)' }}
                    >
                      open my view →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Scoring */}
        {canConfigureScoring && (
          <section
            className="rounded-2xl bg-[color:var(--card)] border p-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <header className="mb-2">
              <h2 className="text-base font-bold text-[color:var(--ink)]">Scoring</h2>
              <p className="mt-1 text-[13px] text-[color:var(--ink-mute)]">
                Points awarded per logged activity. Affects this team&rsquo;s leaderboards.
              </p>
            </header>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Workout</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={workoutScore}
                    onChange={(e) => setWorkoutScore(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-[13px] text-[color:var(--ink-mute)]">points</span>
                </div>
              </div>
              <div>
                <Label>Rehab</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={rehabScore}
                    onChange={(e) => setRehabScore(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-[13px] text-[color:var(--ink-mute)]">points</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={saveScoring}
                disabled={scoringSaving}
                className="rounded-xl font-semibold"
                style={{ background: 'var(--blue)' }}
              >
                {scoringSaving ? 'Saving…' : 'Save scoring'}
              </Button>
              {scoringStatus && (
                <span className="text-[12.5px] text-[color:var(--ink-mute)]">{scoringStatus}</span>
              )}
            </div>
          </section>
        )}

        {/* Heatmap default gender */}
        {canConfigureScoring && (
          <section
            className="rounded-2xl bg-[color:var(--card)] border p-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <header className="mb-3">
              <h2 className="text-base font-bold text-[color:var(--ink)]">Heatmap silhouette</h2>
              <p className="mt-1 text-[13px] text-[color:var(--ink-mute)]">
                Default body figure on the team-wide injury heatmap. Per-athlete pages override this once a player sets their own.
              </p>
            </header>
            <div className="flex items-center gap-2">
              {(['male', 'female'] as const).map((g) => {
                const active = (team?.default_gender ?? 'male') === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => !active && saveGender(g)}
                    disabled={genderSaving || active}
                    className={
                      'rounded-xl border px-4 py-2 text-[13px] font-semibold capitalize transition ' +
                      (active
                        ? 'bg-[color:var(--blue-soft)] text-[color:var(--blue)]'
                        : 'bg-[color:var(--card)] text-[color:var(--ink-soft)] hover:bg-[color:var(--card-hover)]')
                    }
                    style={{ borderColor: active ? 'var(--blue)' : 'var(--border)' }}
                  >
                    {g}
                  </button>
                );
              })}
              {genderStatus && (
                <span className="ml-2 text-[12.5px] text-[color:var(--ink-mute)]">{genderStatus}</span>
              )}
            </div>
          </section>
        )}

        {/* Captain permissions */}
        {canConfigureScoring && team && (
          <section
            className="rounded-2xl bg-[color:var(--card)] border p-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <header className="mb-3">
              <h2 className="text-base font-bold text-[color:var(--ink)]">Captain permissions</h2>
              <p className="mt-1 text-[13px] text-[color:var(--ink-mute)]">
                Sessions &amp; Templates are coach-only by default. Turn this on to let captains see them in the sidebar and edit templates.
              </p>
            </header>
            <div className="flex items-center gap-2 flex-wrap">
              {([false, true] as const).map((v) => {
                const active = (team.captain_can_view_sessions === true) === v;
                return (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => !active && saveCaptainCanViewSessions(v)}
                    disabled={captainPermsSaving || active}
                    className={
                      'rounded-xl border px-4 py-2 text-[13px] font-semibold transition ' +
                      (active
                        ? 'bg-[color:var(--blue-soft)] text-[color:var(--blue)]'
                        : 'bg-[color:var(--card)] text-[color:var(--ink-soft)] hover:bg-[color:var(--card-hover)]')
                    }
                    style={{ borderColor: active ? 'var(--blue)' : 'var(--border)' }}
                  >
                    {v ? 'Visible to captains' : 'Coach only'}
                  </button>
                );
              })}
              {captainPermsStatus && (
                <span className="ml-2 text-[12.5px] text-[color:var(--ink-mute)]">{captainPermsStatus}</span>
              )}
            </div>
          </section>
        )}

        {/* Season / competition start — drives the per-athlete rank in
            the C1 hero and the team leaderboards. Null = no active
            competition (rank falls back to all-time). */}
        {canConfigureScoring && team && (
          <section
            className="rounded-2xl bg-[color:var(--card)] border p-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <header className="mb-3">
              <h2 className="text-base font-bold text-[color:var(--ink)]">Season start</h2>
              <p className="mt-1 text-[13px] text-[color:var(--ink-mute)]">
                The date athlete rankings count from. Change it to start a fresh
                competition; clear it to fall back to all-time.
              </p>
            </header>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={seasonStartInput}
                onChange={(e) => setSeasonStartInput(e.target.value)}
                className="w-[180px]"
              />
              <Button
                onClick={() => saveSeasonStart(seasonStartInput || null)}
                disabled={
                  seasonSaving ||
                  (seasonStartInput || null) === (team.competition_start_date ?? null)
                }
                className="rounded-xl font-semibold"
                style={{ background: 'var(--blue)' }}
              >
                {seasonSaving ? 'Saving…' : 'Save'}
              </Button>
              {team.competition_start_date && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSeasonStartInput('');
                    void saveSeasonStart(null);
                  }}
                  disabled={seasonSaving}
                >
                  Clear
                </Button>
              )}
              {seasonStatus && (
                <span className="ml-2 text-[12.5px] text-[color:var(--ink-mute)]">{seasonStatus}</span>
              )}
            </div>
            {team.competition_start_date && (
              <p className="mt-3 text-[12.5px] text-[color:var(--ink-mute)]">
                Currently counting from <span className="font-semibold text-[color:var(--ink)]">{team.competition_start_date}</span>.
              </p>
            )}
          </section>
        )}

        {/* Personal heatmap figure (only for users linked to a roster athlete) */}
        {impersonatedPlayer && (
          <section
            className="rounded-2xl bg-[color:var(--card)] border p-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <header className="mb-3">
              <h2 className="text-base font-bold text-[color:var(--ink)]">My heatmap figure</h2>
              <p className="mt-1 text-[13px] text-[color:var(--ink-mute)]">
                Pick the body figure your own profile&rsquo;s injury heatmap shows. If unset, your team default is used.
              </p>
            </header>
            <div className="flex items-center gap-2 flex-wrap">
              {([null, 'male', 'female'] as const).map((g) => {
                const label = g == null ? 'Use team default' : g.charAt(0).toUpperCase() + g.slice(1);
                const active = (impersonatedPlayer.gender ?? null) === g;
                return (
                  <button
                    key={String(g)}
                    type="button"
                    onClick={() => !active && saveMyGender(g)}
                    disabled={meGenderSaving || active}
                    className={
                      'rounded-xl border px-4 py-2 text-[13px] font-semibold transition ' +
                      (active
                        ? 'bg-[color:var(--blue-soft)] text-[color:var(--blue)]'
                        : 'bg-[color:var(--card)] text-[color:var(--ink-soft)] hover:bg-[color:var(--card-hover)]')
                    }
                    style={{ borderColor: active ? 'var(--blue)' : 'var(--border)' }}
                  >
                    {label}
                  </button>
                );
              })}
              {meGenderStatus && (
                <span className="ml-2 text-[12.5px] text-[color:var(--ink-mute)]">{meGenderStatus}</span>
              )}
            </div>
          </section>
        )}

        {/* Phone OTP */}
        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-base font-bold text-[color:var(--ink)]">Link your phone to the roster</h2>
            <Phone className="size-4 text-[color:var(--ink-mute)]" />
          </div>
          <p className="text-[13px] text-[color:var(--ink-mute)] leading-relaxed mb-5">
            If you&rsquo;re also on the roster, verify your number and we&rsquo;ll link it to
            your athlete entry. You keep your current role and gain a personal athlete view.
          </p>

          <div className="space-y-4">
            {impersonatedPlayer && (
              <div
                className="flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px]"
                style={{
                  borderColor: 'color-mix(in srgb, var(--green) 40%, transparent)',
                  background: 'color-mix(in srgb, var(--green) 8%, transparent)',
                }}
              >
                <CheckCircle2 className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--green)' }} />
                <div>
                  Currently linked to <strong>{impersonatedPlayer.name}</strong>
                  {impersonatedPlayer.group && (
                    <span className="text-[color:var(--ink-mute)]"> · {impersonatedPlayer.group}</span>
                  )}
                  .{' '}
                  <Link
                    href="/dashboard/athlete"
                    className="underline underline-offset-4"
                    style={{ color: 'var(--blue)' }}
                  >
                    open your view →
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
                  >
                    {otpSending ? 'Sending…' : 'Send code'}
                  </Button>
                </div>
                <p className="text-[12px] text-[color:var(--ink-mute)] leading-relaxed">
                  Include your country code (+1, +61, etc.). We SMS a 6-digit code via the team&rsquo;s
                  Twilio number.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>
                  Code sent to{' '}
                  <span className="text-[color:var(--ink)]">
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
                  >
                    Change phone
                  </Button>
                </div>
              </div>
            )}

            {otpMessage && (
              <div
                className="flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px]"
                style={{
                  borderColor: otpMessage.tone === 'ok'
                    ? 'color-mix(in srgb, var(--green) 40%, transparent)'
                    : 'color-mix(in srgb, var(--red) 40%, transparent)',
                  background: otpMessage.tone === 'ok'
                    ? 'color-mix(in srgb, var(--green) 8%, transparent)'
                    : 'color-mix(in srgb, var(--red) 8%, transparent)',
                }}
              >
                {otpMessage.tone === 'ok' ? (
                  <CheckCircle2 className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--green)' }} />
                ) : (
                  <AlertCircle className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--red)' }} />
                )}
                {otpMessage.text}
              </div>
            )}
          </div>
        </section>

        {/* Preferences + Account */}
        <div className="reveal reveal-3 grid gap-6 lg:grid-cols-2">
          {/* Preferences — coach/captain/admin only. The group filter
              narrows team-wide views by group, so it has no effect for
              athletes (who only see themselves). */}
          {currentRole !== 'athlete' && (
            <section className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)] mb-5">Preferences</h2>
              <div className="space-y-4">
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
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[12px] text-[color:var(--ink-mute)]">
                    Applies when your role is captain, or always if you pick one as coach.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save preferences'}
                  </Button>
                  {status && (
                    <span className="text-[12px] text-[color:var(--ink-mute)]">{status}</span>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Account */}
          <section className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)] mb-5">Account</h2>
            <dl className="grid grid-cols-[100px_1fr] gap-y-0 gap-x-4">
              <Dt>Email</Dt>
              <Dd mono>{user?.primaryEmailAddress?.emailAddress ?? '—'}</Dd>
              <Dt>Name</Dt>
              <Dd>{user?.fullName ?? '—'}</Dd>
              <Dt>Team</Dt>
              <Dd>
                {team?.name ?? '—'}{' '}
                <span className="text-[color:var(--ink-mute)] mono text-[12px]">({team?.code ?? '—'})</span>
              </Dd>
              <Dt>Role</Dt>
              <Dd>
                <Pill tone={roleTone}>{currentRole}</Pill>
              </Dd>
            </dl>
            {canEditRole && (
              <details className="mt-5">
                <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] transition">
                  Developer details
                </summary>
                <dl className="mt-3 grid grid-cols-[100px_1fr] gap-y-0 gap-x-4">
                  <Dt>Clerk ID</Dt>
                  <Dd mono>
                    <span className="text-[color:var(--ink-mute)] break-all">
                      {prefs?.clerk_user_id ?? '—'}
                    </span>
                  </Dd>
                </dl>
              </details>
            )}
          </section>
        </div>

        {/* Database + Worker health */}
        <div className="reveal reveal-4 grid gap-6 lg:grid-cols-2">
          {/* Database */}
          <section className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)] mb-1">Database</h2>
            <p className="text-[12px] text-[color:var(--ink-mute)] mb-4">Records scoped to your team</p>
            <ul className="space-y-2">
              <KV label="Athletes" value={stats?.players ?? 0} tone="blue" />
              <KV label="Messages indexed" value={stats?.messages ?? 0} />
              <KV label="Activity log entries" value={stats?.activity ?? 0} tone="green" />
            </ul>
          </section>

          {/* Worker health */}
          <section className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)] mb-1">Worker health</h2>
            <p className="text-[12px] text-[color:var(--ink-mute)] mb-4">Last polls + error state</p>
            <ul className="space-y-2">
              <KV label="Twilio poll" value={relativeTime(lastTwilio)} mono />
              <KV label="Weather poll" value={relativeTime(lastWeather)} mono />
              <KV
                label="Consecutive errors"
                value={state?.consecutive_errors ?? 0}
                tone={(state?.consecutive_errors ?? 0) > 0 ? 'red' : 'green'}
              />
              <KV label="Backfill" value={state?.backfill_complete ? 'complete' : 'in progress'} mono />
              {state?.last_error && (
                <li className="mono text-[11px] leading-snug mt-2" style={{ color: 'var(--red)' }}>
                  <span className="text-[color:var(--ink-dim)] uppercase tracking-wide">Last error: </span>
                  {state.last_error}
                </li>
              )}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
