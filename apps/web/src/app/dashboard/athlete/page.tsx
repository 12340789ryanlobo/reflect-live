'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { Pill } from '@/components/v3/pill';
import { ReadinessBar } from '@/components/v3/readiness-bar';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, TwilioMessage, ActivityLog, Category } from '@reflect-live/shared';
import { computeLeaderboard, weekStartCT, type LeaderboardRow } from '@/lib/scoring';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogOut } from 'lucide-react';
import {
  prettyCategory,
  prettyDate,
  prettyDateTime,
  prettyDirection,
  relativeTime,
} from '@/lib/format';

const CAT_PILL_TONE: Record<Category, 'green' | 'amber' | 'blue' | 'mute'> = {
  workout: 'green',
  rehab: 'amber',
  survey: 'blue',
  chat: 'mute',
};

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function clockHM(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AthletePage() {
  const { prefs, team, refresh } = useDashboard();
  const router = useRouter();

  // Canonical URL for an athlete viewing their own data is
  // /dashboard/players/[their-player-id]. Redirect there as soon as we
  // know which player they are. Admins without an impersonation set fall
  // through to the picker below.
  useEffect(() => {
    if (prefs.impersonate_player_id) {
      router.replace(`/dashboard/players/${prefs.impersonate_player_id}`);
    }
  }, [prefs.impersonate_player_id, router]);

  const sb = useSupabase();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [me, setMe] = useState<Player | null>(null);
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [days, setDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [weekRank, setWeekRank] = useState<number | null>(null);
  const [allTimeRank, setAllTimeRank] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: players } = await sb
        .from('players')
        .select('*')
        .eq('team_id', prefs.team_id)
        .order('name');
      setAllPlayers((players ?? []) as Player[]);
      const playerId = prefs.impersonate_player_id;
      if (playerId) {
        const { data: playerData } = await sb.from('players').select('*').eq('id', playerId).single();
        setMe(playerData as Player);
      } else {
        setMe(null);
      }
    })();
  }, [sb, prefs.team_id, prefs.impersonate_player_id]);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const [{ data: m }, { data: l }] = await Promise.all([
        sb
          .from('twilio_messages')
          .select('*')
          .eq('player_id', me.id)
          .gte('date_sent', since)
          .order('date_sent', { ascending: false })
          .limit(100),
        sb
          .from('activity_logs')
          .select('*')
          .eq('player_id', me.id)
          .order('logged_at', { ascending: false })
          .limit(50),
      ]);
      setMsgs((m ?? []) as TwilioMessage[]);
      setLogs((l ?? []) as ActivityLog[]);
    })();
  }, [sb, me, days]);

  const workoutScore = team.scoring_json.workout_score;
  const rehabScore = team.scoring_json.rehab_score;
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      const scoring = { workout_score: workoutScore, rehab_score: rehabScore };
      const sinceISO = weekStartCT().toISOString();
      const [week, allTime] = await Promise.all([
        computeLeaderboard(sb, prefs.team_id, scoring, sinceISO),
        computeLeaderboard(sb, prefs.team_id, scoring),
      ]);
      if (cancelled) return;
      const findRank = (rows: LeaderboardRow[], pid: number): number | null => {
        const idx = rows.findIndex((r) => r.player_id === pid);
        return idx === -1 ? null : idx + 1;
      };
      setWeekRank(findRank(week, me.id));
      setAllTimeRank(findRank(allTime, me.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, prefs.team_id, workoutScore, rehabScore, me?.id]);

  async function setAthlete(playerId: number | null) {
    setSaving(true);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: prefs.team_id,
        watchlist: prefs.watchlist,
        group_filter: prefs.group_filter,
        role: playerId ? 'athlete' : 'coach',
        impersonate_player_id: playerId,
      }),
    });
    setSaving(false);
    await refresh();
  }

  const derived = useMemo(() => {
    const inboundCount = msgs.filter((m) => m.direction === 'inbound').length;
    const workoutCount = msgs.filter((m) => m.category === 'workout').length;
    const rehabCount = msgs.filter((m) => m.category === 'rehab').length;
    const surveyReadings = msgs
      .filter((m) => m.category === 'survey' && m.body)
      .map((m) => {
        const match = /^(\d{1,2})/.exec(m.body!.trim());
        return match ? Number(match[1]) : null;
      })
      .filter((n): n is number => n !== null && n >= 1 && n <= 10);
    const avgReadiness = surveyReadings.length
      ? Math.round((surveyReadings.reduce((a, b) => a + b, 0) / surveyReadings.length) * 10) / 10
      : null;
    return { inboundCount, workoutCount, rehabCount, surveyReadings, avgReadiness };
  }, [msgs]);

  const daysShort = days === 7 ? '7d' : days === 30 ? '30d' : days === 90 ? '90d' : `${days}d`;

  // Picker mode
  if (!me) {
    return (
      <>
        <PageHeader
          eyebrow="Athlete simulator"
          title="My view"
          subtitle="Pick an athlete to simulate"
        />
        <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
          <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-[14px] font-bold text-[color:var(--ink)] mb-2">About athlete view</h2>
            <p className="text-[14px] text-[color:var(--ink-soft)] leading-relaxed">
              Pick any athlete to see the dashboard as <em>they</em> see it —
              only their messages, only their workouts, only their readiness. Useful for previewing
              what an athlete sees before they sign in.
            </p>
          </section>

          <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Roster · {allPlayers.length} athletes</h2>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {allPlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setAthlete(p.id)}
                  disabled={saving}
                  className="group flex items-center gap-3 border-b px-6 py-3 text-left transition hover:bg-[color:var(--card-hover)] disabled:opacity-50"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="grid size-8 place-items-center rounded-md border bg-[color:var(--paper)] text-[11px] font-bold shrink-0" style={{ borderColor: 'var(--border)' }}>
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[color:var(--ink)]">
                      {p.name}
                    </div>
                    <div className="text-[12px] text-[color:var(--ink-mute)]">
                      {p.group ?? 'no group'}
                    </div>
                  </div>
                  <span className="text-[12px] text-[color:var(--ink-dim)]">→</span>
                </button>
              ))}
            </div>
          </section>
        </main>
      </>
    );
  }

  // Selected mode
  return (
    <>
      <PageHeader
        eyebrow="My view"
        title={me.name}
        subtitle={`${me.group ?? 'No group'} · ${daysShort}`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[140px] h-9 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setAthlete(null)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] font-semibold text-[color:var(--ink-soft)] hover:border-[color:var(--red)] hover:text-[color:var(--red)] transition disabled:opacity-60"
              style={{ borderColor: 'var(--border)' }}
            >
              <LogOut className="size-3.5" />
              Exit
            </button>
          </div>
        }
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Hero row */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-12">
          {/* Stats card */}
          <div className="rounded-2xl bg-[color:var(--card)] border lg:col-span-8" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Your telemetry</h2>
            </header>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
              <div className="p-6">
                <StatCell label="My messages" value={derived.inboundCount} sub={daysShort} tone="blue" />
              </div>
              <div className="p-6">
                <StatCell
                  label="My workouts"
                  value={derived.workoutCount}
                  sub={daysShort}
                  tone={derived.workoutCount ? 'green' : 'default'}
                />
              </div>
              <div className="p-6">
                <StatCell
                  label="My rehabs"
                  value={derived.rehabCount}
                  sub={daysShort}
                  tone={derived.rehabCount ? 'amber' : 'default'}
                />
              </div>
              <div className="p-6">
                <StatCell
                  label="Avg readiness"
                  value={derived.avgReadiness ?? '—'}
                  sub={derived.surveyReadings.length ? `${derived.surveyReadings.length} responses` : 'no surveys'}
                />
              </div>
            </div>
            <div className="px-6 pb-5 pt-3 flex items-center gap-2 flex-wrap">
              <Pill tone="green">athlete view</Pill>
              <span className="text-[12px] text-[color:var(--ink-mute)]">Simulating {me.name}</span>
              <span className="text-[12px] text-[color:var(--ink-mute)]">·</span>
              <div className="text-[12px] text-[color:var(--ink-mute)]">
                Your rank:{' '}
                <span className="font-semibold text-[color:var(--ink)]">
                  {weekRank != null ? `#${weekRank} this week` : 'unranked this week'}
                </span>
                {' · '}
                <span className="font-semibold text-[color:var(--ink)]">
                  {allTimeRank != null ? `#${allTimeRank} all-time` : 'unranked all-time'}
                </span>
              </div>
            </div>
          </div>

          {/* Readiness card */}
          <div className="rounded-2xl bg-[color:var(--card)] border p-6 lg:col-span-4 flex flex-col justify-center" style={{ borderColor: 'var(--border)' }}>
            <ReadinessBar
              value={derived.avgReadiness}
              responses={derived.surveyReadings.length}
              size="md"
            />
          </div>
        </section>

        {/* Messages + Activity split */}
        <section className="reveal reveal-2 grid gap-6 lg:grid-cols-2">
          {/* Messages */}
          <div className="rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">My recent messages</h2>
              <span className="text-[12px] text-[color:var(--ink-mute)]">{msgs.length} total</span>
            </header>
            {msgs.length === 0 ? (
              <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
                — no messages in this period —
              </p>
            ) : (
              <ScrollArea className="h-[420px]">
                <ul>
                  {msgs.slice(0, 25).map((m) => {
                    const tone = CAT_PILL_TONE[m.category] ?? 'mute';
                    return (
                      <li key={m.sid} className="flex items-start gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                        <div className="shrink-0 w-[76px] text-right">
                          <div className="mono text-[12px] text-[color:var(--blue)] tabular">
                            {clockHM(m.date_sent)}
                          </div>
                          <div
                            className="mono text-[11px] text-[color:var(--ink-dim)] tabular mt-0.5"
                            title={prettyDateTime(m.date_sent)}
                          >
                            {relativeTime(m.date_sent)}
                          </div>
                        </div>
                        <div className="shrink-0 w-px self-stretch bg-[color:var(--border)]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Pill tone={tone}>{prettyCategory(m.category)}</Pill>
                            <span className="text-[11px] text-[color:var(--ink-dim)]">
                              {prettyDirection(m.direction)}
                            </span>
                          </div>
                          {m.body && (
                            <div className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
                              {m.body}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </div>

          {/* Activity log */}
          <div className="rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">My activity log</h2>
              <span className="text-[12px] text-[color:var(--ink-mute)]">{logs.length} total</span>
            </header>
            {logs.length === 0 ? (
              <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
                — no historical logs —
              </p>
            ) : (
              <ScrollArea className="h-[420px]">
                <ul>
                  {logs.slice(0, 25).map((l) => {
                    const tone: 'green' | 'amber' = l.kind === 'workout' ? 'green' : 'amber';
                    return (
                      <li key={l.id} className="flex items-start gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                        <div className="shrink-0 w-[76px] text-right">
                          <div className="mono text-[12px] text-[color:var(--ink-soft)] tabular">
                            {prettyDate(l.logged_at)}
                          </div>
                        </div>
                        <div className="shrink-0 w-px self-stretch bg-[color:var(--border)]" />
                        <div className="min-w-0 flex-1">
                          <Pill tone={tone}>{prettyCategory(l.kind)}</Pill>
                          {l.description && (
                            <div className="mt-1 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
                              {l.description}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
