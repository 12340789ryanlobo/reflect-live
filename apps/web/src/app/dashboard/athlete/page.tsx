'use client';
import { useEffect, useMemo, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { ReadinessDial } from '@/components/readiness-dial';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, TwilioMessage, ActivityLog, Category } from '@reflect-live/shared';
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

const CAT_TONE: Record<Category, { color: string; bg: string; border: string }> = {
  workout: { color: 'hsl(162 62% 54%)', bg: 'hsl(162 40% 18% / 0.4)', border: 'hsl(162 40% 40%)' },
  rehab:   { color: 'hsl(38 90% 62%)',  bg: 'hsl(38 60% 20% / 0.4)',  border: 'hsl(38 60% 40%)' },
  survey:  { color: 'hsl(188 82% 58%)', bg: 'hsl(188 60% 20% / 0.4)', border: 'hsl(188 60% 40%)' },
  chat:    { color: 'hsl(36 10% 62%)',  bg: 'hsl(220 14% 14%)',       border: 'hsl(220 14% 24%)' },
};

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function clockHM(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AthletePage() {
  const { prefs, refresh } = useDashboard();
  const sb = useSupabase();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [me, setMe] = useState<Player | null>(null);
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [days, setDays] = useState(30);
  const [saving, setSaving] = useState(false);

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

  const daysShort = days === 7 ? '7D' : days === 30 ? '30D' : days === 90 ? '90D' : `${days}D`;

  // Picker mode
  if (!me) {
    return (
      <>
        <PageHeader
          eyebrow="Your view"
          title="Your"
          italic="view."
          subtitle="PICK AN ATHLETE TO SIMULATE"
        />
        <main className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
          <section className="reveal reveal-1 panel p-5">
            <SectionTag name="About athlete view" />
            <p className="mt-3 text-sm text-[color:var(--bone-soft)] leading-relaxed">
              Pick any athlete to see the dashboard as <em className="italic">they</em> see it —
              only their messages, only their workouts, only their readiness. Useful for previewing
              what an athlete sees before they sign in.
            </p>
          </section>

          <section className="reveal reveal-2 panel">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag name={`Roster · ${allPlayers.length} athletes`} />
            </div>
            <div className="grid grid-cols-1 gap-0 md:grid-cols-2 xl:grid-cols-3">
              {allPlayers.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setAthlete(p.id)}
                  disabled={saving}
                  className={`group flex items-center gap-3 border-b border-[color:var(--hairline)]/50 px-5 py-3 text-left transition hover:bg-[color:var(--panel-raised)]/50 disabled:opacity-50 ${
                    i % 3 !== 2 ? 'xl:border-r xl:border-[color:var(--hairline)]/50' : ''
                  } ${i % 2 !== 1 ? 'md:border-r md:border-[color:var(--hairline)]/50 xl:border-r' : ''}`}
                >
                  <span className="grid size-8 place-items-center rounded-sm border border-[color:var(--hairline)] bg-[color:var(--panel-raised)] text-[0.66rem] font-semibold">
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[color:var(--bone)] group-hover:text-[color:var(--signal)] transition">
                      {p.name}
                    </div>
                    <div className="mono text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                      {p.group ?? 'no group'}
                    </div>
                  </div>
                  <span className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)] group-hover:text-[color:var(--signal)] transition">
                    →
                  </span>
                </button>
              ))}
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        code={`ME·${String(me.id).padStart(3, '0')}`}
        eyebrow="Your lane"
        title={me.name.split(' ')[0]}
        italic={`${me.name.split(' ').slice(1).join(' ')}.`}
        subtitle={`${me.group ? me.group.toUpperCase() : 'NO GROUP'} · WINDOW ${daysShort}`}
        right={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[140px] h-9 mono text-xs uppercase tracking-wider">
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
              className="inline-flex items-center gap-2 border border-[color:var(--hairline-strong)] px-3 py-2 mono text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--bone-soft)] hover:border-[color:var(--siren)] hover:text-[color:var(--siren)] transition disabled:opacity-60"
            >
              <LogOut className="size-3.5" />
              Exit
            </button>
          </div>
        }
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* Personal dial + readouts */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-12">
          <div className="panel flex flex-col items-center justify-center gap-4 p-6 lg:col-span-4">
            <SectionTag name="Your readiness" className="w-full" />
            <ReadinessDial
              value={derived.avgReadiness}
              responses={derived.surveyReadings.length}
              size={260}
              label="Personal avg"
              sublabel={
                derived.surveyReadings.length ? `${derived.surveyReadings.length} RESPONSES` : 'NO SURVEYS YET'
              }
            />
          </div>
          <div className="panel lg:col-span-8">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag name="Your telemetry" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 md:grid-cols-4">
              <StatReadout label="Your messages" value={derived.inboundCount} sub={daysShort} tone="signal" />
              <StatReadout
                label="Your workouts"
                value={derived.workoutCount}
                sub={daysShort}
                tone={derived.workoutCount ? 'chlorine' : 'default'}
              />
              <StatReadout
                label="Your rehabs"
                value={derived.rehabCount}
                sub={daysShort}
                tone={derived.rehabCount ? 'amber' : 'default'}
              />
              <StatReadout
                label="Avg readiness"
                value={derived.avgReadiness ?? '—'}
                sub={derived.surveyReadings.length ? `${derived.surveyReadings.length} RESPONSES` : 'NO SURVEYS'}
              />
            </div>
            <div className="px-5 pb-5">
              <div className="mt-3 flex items-center gap-2">
                <Stamp tone="on">athlete view</Stamp>
                <span className="mono text-[0.62rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                  Simulating {me.name}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Messages + Activity split */}
        <section id="messages" className="reveal reveal-2 grid gap-6 lg:grid-cols-2">
          <div className="panel overflow-hidden">
            <div className="px-5 pt-4 pb-3">
              <SectionTag
                name="Your messages"
                right={
                  <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                    {msgs.length} TOTAL
                  </span>
                }
              />
            </div>
            {msgs.length === 0 ? (
              <div className="border-t border-[color:var(--hairline)] px-6 py-10 text-center">
                <p className="mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
                  — no messages in this period —
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[420px] border-t border-[color:var(--hairline)]">
                <ul>
                  {msgs.slice(0, 25).map((m) => {
                    const tone = CAT_TONE[m.category] ?? CAT_TONE.chat;
                    return (
                      <li key={m.sid} className="border-b border-[color:var(--hairline)]/60 px-5 py-3">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-[76px] text-right">
                            <div className="mono text-[0.68rem] text-[color:var(--signal)] tabular">
                              {clockHM(m.date_sent)}
                            </div>
                            <div
                              className="mono text-[0.6rem] text-[color:var(--bone-dim)] tabular mt-0.5"
                              title={prettyDateTime(m.date_sent)}
                            >
                              {relativeTime(m.date_sent)}
                            </div>
                          </div>
                          <div className="shrink-0 w-px self-stretch bg-[color:var(--hairline)]" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="mono px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] rounded-sm"
                                style={{
                                  color: tone.color,
                                  background: tone.bg,
                                  border: `1px solid ${tone.border}`,
                                }}
                              >
                                {prettyCategory(m.category)}
                              </span>
                              <span className="mono text-[0.6rem] text-[color:var(--bone-dim)] uppercase tracking-[0.16em]">
                                {prettyDirection(m.direction)}
                              </span>
                            </div>
                            {m.body && (
                              <div className="mt-1.5 text-sm leading-relaxed text-[color:var(--bone-soft)]">
                                {m.body}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </div>

          <div className="panel overflow-hidden">
            <div className="px-5 pt-4 pb-3">
              <SectionTag
                name="Your activity log"
                right={
                  <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                    {logs.length} TOTAL
                  </span>
                }
              />
            </div>
            {logs.length === 0 ? (
              <div className="border-t border-[color:var(--hairline)] px-6 py-10 text-center">
                <p className="mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
                  — no historical logs —
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[420px] border-t border-[color:var(--hairline)]">
                <ul>
                  {logs.slice(0, 25).map((l) => {
                    const tone = l.kind === 'workout' ? CAT_TONE.workout : CAT_TONE.rehab;
                    return (
                      <li key={l.id} className="border-b border-[color:var(--hairline)]/60 px-5 py-3">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-[76px] text-right">
                            <div className="mono text-[0.7rem] text-[color:var(--bone-soft)] tabular">
                              {prettyDate(l.logged_at)}
                            </div>
                          </div>
                          <div className="shrink-0 w-px self-stretch bg-[color:var(--hairline)]" />
                          <div className="min-w-0 flex-1">
                            <span
                              className="mono inline-block px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] rounded-sm mb-1"
                              style={{
                                color: tone.color,
                                background: tone.bg,
                                border: `1px solid ${tone.border}`,
                              }}
                            >
                              {prettyCategory(l.kind)}
                            </span>
                            {l.description && (
                              <div className="mt-0.5 text-sm leading-relaxed text-[color:var(--bone-soft)]">
                                {l.description}
                              </div>
                            )}
                          </div>
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
