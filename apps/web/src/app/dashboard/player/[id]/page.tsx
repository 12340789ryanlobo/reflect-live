'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StarButton } from '@/components/star-button';
import { StatCell } from '@/components/v3/stat-cell';
import { Pill } from '@/components/v3/pill';
import { ReadinessBar } from '@/components/v3/readiness-bar';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player, TwilioMessage, ActivityLog, Category } from '@reflect-live/shared';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  prettyCategory,
  prettyDate,
  prettyDateTime,
  prettyDirection,
  prettyPhone,
  relativeTime,
} from '@/lib/format';

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function clockHM(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

const CAT_PILL_TONE: Record<Category, 'green' | 'amber' | 'blue' | 'mute'> = {
  workout: 'green',
  rehab: 'amber',
  survey: 'blue',
  chat: 'mute',
};

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const playerId = Number(id);
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [player, setPlayer] = useState<Player | null>(null);
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: m }, { data: l }] = await Promise.all([
        sb.from('players').select('*').eq('id', playerId).single(),
        sb
          .from('twilio_messages')
          .select('*')
          .eq('player_id', playerId)
          .order('date_sent', { ascending: false })
          .limit(50),
        sb
          .from('activity_logs')
          .select('*')
          .eq('player_id', playerId)
          .order('logged_at', { ascending: false })
          .limit(30),
      ]);
      setPlayer(p as Player);
      setMsgs((m ?? []) as TwilioMessage[]);
      setLogs((l ?? []) as ActivityLog[]);
    })();
  }, [sb, playerId]);

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
    const lastInbound = msgs.find((m) => m.direction === 'inbound')?.date_sent ?? null;
    const flags = surveyReadings.filter((n) => n <= 4).length;
    return { inboundCount, workoutCount, rehabCount, surveyReadings, avgReadiness, lastInbound, flags };
  }, [msgs]);

  if (!player) {
    return (
      <>
        <PageHeader eyebrow="Athlete card" title="Loading…" />
        <main className="flex flex-1 p-6">
          <p className="text-[13px] text-[color:var(--ink-mute)]">— loading athlete —</p>
        </main>
      </>
    );
  }

  const starred = prefs.watchlist.includes(playerId);
  const hrs = hoursSince(derived.lastInbound);
  const statusTone: 'green' | 'amber' | 'mute' =
    hrs == null ? 'mute' : hrs < 24 ? 'green' : hrs < 72 ? 'amber' : 'mute';
  const statusText =
    hrs == null ? 'quiet' : hrs < 1 ? 'live' : hrs < 24 ? 'on wire' : hrs < 72 ? 'watch' : 'quiet';

  return (
    <>
      <PageHeader
        eyebrow="Profile"
        title={player.name}
        subtitle={`${player.group ?? 'No group'} · ${prettyPhone(player.phone_e164)}`}
        actions={<StarButton playerId={playerId} initial={starred} />}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Hero row */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-12">
          {/* Identity card */}
          <div className="rounded-2xl bg-[color:var(--card)] border p-6 lg:col-span-8" style={{ borderColor: 'var(--border)' }}>
            <div className="grid gap-6 md:grid-cols-[auto_1fr]">
              {/* Avatar block */}
              <div className="flex flex-col items-center gap-2">
                <div className="grid size-28 place-items-center rounded-md border bg-[color:var(--paper)] text-2xl font-bold" style={{ borderColor: 'var(--border)' }}>
                  {initials(player.name)}
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--ink-dim)]">
                  ID · {String(player.id).padStart(4, '0')}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold text-[color:var(--ink)]">{player.name}</h2>
                <dl className="grid grid-cols-2 gap-y-3 gap-x-6">
                  <Row label="Group" value={player.group ?? '—'} />
                  <Row label="Phone" value={prettyPhone(player.phone_e164)} mono />
                  <Row
                    label="Status"
                    value={<Pill tone={statusTone}>{statusText}</Pill>}
                  />
                  <Row
                    label="Last on wire"
                    value={derived.lastInbound ? relativeTime(derived.lastInbound) : '—'}
                    mono
                  />
                </dl>
                <div className="grid grid-cols-2 gap-0 border-t pt-4 md:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
                  <div className="pr-4">
                    <StatCell label="Inbound" value={derived.inboundCount} sub="last 50" tone="blue" />
                  </div>
                  <div className="px-4">
                    <StatCell label="Workouts" value={derived.workoutCount} tone={derived.workoutCount ? 'green' : 'default'} />
                  </div>
                  <div className="px-4">
                    <StatCell label="Rehabs" value={derived.rehabCount} tone={derived.rehabCount ? 'amber' : 'default'} />
                  </div>
                  <div className="pl-4">
                    <StatCell
                      label="Responses"
                      value={derived.surveyReadings.length}
                      tone={derived.flags > 0 ? 'red' : 'default'}
                      sub={derived.flags > 0 ? `${derived.flags} flag${derived.flags === 1 ? '' : 's'}` : undefined}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Readiness card */}
          <div className="rounded-2xl bg-[color:var(--card)] border p-6 lg:col-span-4 flex flex-col justify-center" style={{ borderColor: 'var(--border)' }}>
            <ReadinessBar
              value={derived.avgReadiness}
              responses={derived.surveyReadings.length}
              flagged={derived.flags}
              size="md"
            />
          </div>
        </section>

        {/* Messages */}
        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Messages</h2>
            <span className="text-[12px] text-[color:var(--ink-mute)]">
              {msgs.length} total · last 50 shown
            </span>
          </header>
          {msgs.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[13px] text-[color:var(--ink-mute)]">— no messages yet —</p>
            </div>
          ) : (
            <ScrollArea className="h-[440px] border-t" style={{ borderColor: 'var(--border)' }}>
              <ul>
                {msgs.map((m) => (
                  <li
                    key={m.sid}
                    className="border-b px-5 py-3"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 w-[84px] text-right">
                        <div className="mono text-[0.68rem] tabular text-[color:var(--blue)]">
                          {clockHM(m.date_sent)}
                        </div>
                        <div
                          className="mono text-[0.6rem] tabular mt-0.5 text-[color:var(--ink-dim)]"
                          title={prettyDateTime(m.date_sent)}
                        >
                          {relativeTime(m.date_sent)}
                        </div>
                      </div>
                      <div className="shrink-0 w-px self-stretch bg-[color:var(--border)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Pill tone={CAT_PILL_TONE[m.category] ?? 'mute'}>
                            {prettyCategory(m.category)}
                          </Pill>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-dim)]">
                            {prettyDirection(m.direction)}
                          </span>
                        </div>
                        {m.body && (
                          <div className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--ink-soft)]">
                            {m.body}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </section>

        {/* Activity log */}
        <section className="reveal reveal-3 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Activity log</h2>
            <span className="text-[12px] text-[color:var(--ink-mute)]">{logs.length} entries</span>
          </header>
          {logs.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[13px] text-[color:var(--ink-mute)]">— no historical activity for this athlete —</p>
            </div>
          ) : (
            <ul className="border-t" style={{ borderColor: 'var(--border)' }}>
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="flex items-start gap-4 border-b px-5 py-3 last:border-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="shrink-0 w-[84px] text-right">
                    <div
                      className="mono text-[0.7rem] tabular text-[color:var(--ink-soft)]"
                      title={prettyDateTime(l.logged_at)}
                    >
                      {prettyDate(l.logged_at)}
                    </div>
                  </div>
                  <div className="shrink-0 w-px self-stretch bg-[color:var(--border)]" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1">
                      <Pill tone={l.kind === 'workout' ? 'green' : 'amber'}>
                        {prettyCategory(l.kind)}
                      </Pill>
                    </div>
                    <div className="text-[14px] leading-relaxed text-[color:var(--ink-soft)]">
                      {l.description}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
        {label}
      </dt>
      <dd className={`mt-1 text-[color:var(--ink)] ${mono ? 'mono text-[13px]' : 'text-[14px]'}`}>
        {value}
      </dd>
    </div>
  );
}
