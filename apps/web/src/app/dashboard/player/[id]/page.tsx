'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StarButton } from '@/components/star-button';
import { StatReadout } from '@/components/stat-readout';
import { ReadinessDial } from '@/components/readiness-dial';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
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
function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

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
        <PageHeader code="01·PLAYER" eyebrow="Athlete card" title="Loading…" />
        <main className="flex flex-1 p-6">
          <p className="mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
            — loading athlete —
          </p>
        </main>
      </>
    );
  }

  const starred = prefs.watchlist.includes(playerId);
  const hrs = hoursSince(derived.lastInbound);
  const stampTone = hrs == null ? 'quiet' : hrs < 1 ? 'live' : hrs < 24 ? 'on' : hrs < 72 ? 'watch' : 'quiet';
  const stampText = hrs == null ? 'quiet' : hrs < 1 ? 'live' : hrs < 24 ? 'on wire' : hrs < 72 ? 'watch' : 'quiet';

  return (
    <>
      <PageHeader
        code={`#${String(player.id).padStart(3, '0')}`}
        eyebrow="Athlete card"
        title={player.name.split(' ')[0]}
        italic={player.name.split(' ').slice(1).join(' ')}
        subtitle={`${player.group ?? 'NO GROUP'} · ${prettyPhone(player.phone_e164).toUpperCase()}`}
        right={<StarButton playerId={playerId} initial={starred} />}
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* Passport header + dial */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-12">
          {/* Passport card */}
          <div className="panel lg:col-span-8">
            <div className="border-b border-[color:var(--hairline)] px-5 py-3">
              <SectionTag code="CARD" name="Athlete card" right={<Stamp tone={stampTone}>{stampText}</Stamp>} />
            </div>
            <div className="grid gap-6 p-6 md:grid-cols-[auto_1fr]">
              {/* Photo block */}
              <div className="flex flex-col items-center">
                <div className="grid size-28 place-items-center rounded-sm border border-[color:var(--hairline-strong)] bg-[color:var(--panel-raised)] h-serif text-3xl font-semibold">
                  {initials(player.name)}
                </div>
                <div className="mono mt-3 text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                  ID · {String(player.id).padStart(4, '0')}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h2 className="h-display text-5xl leading-[0.95]">
                  {player.name.split(' ')[0]}{' '}
                  <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
                    {player.name.split(' ').slice(1).join(' ')}
                  </span>
                </h2>
                <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <Row label="Group" value={player.group ?? '—'} />
                  <Row label="Phone" value={prettyPhone(player.phone_e164)} mono />
                  <Row label="Status" value={<Stamp tone={stampTone}>{stampText}</Stamp>} />
                  <Row
                    label="Last on wire"
                    value={derived.lastInbound ? relativeTime(derived.lastInbound) : '—'}
                    mono
                  />
                </dl>
                <div className="grid grid-cols-2 gap-6 border-t border-[color:var(--hairline)] pt-4 md:grid-cols-4">
                  <StatReadout
                    label="Inbound"
                    value={derived.inboundCount}
                    sub="LAST 50"
                    tone="signal"
                  />
                  <StatReadout
                    label="Workouts"
                    value={derived.workoutCount}
                    tone={derived.workoutCount ? 'chlorine' : 'default'}
                  />
                  <StatReadout
                    label="Rehabs"
                    value={derived.rehabCount}
                    tone={derived.rehabCount ? 'amber' : 'default'}
                  />
                  <StatReadout
                    label="Responses"
                    value={derived.surveyReadings.length}
                    tone={derived.flags > 0 ? 'siren' : 'default'}
                    sub={derived.flags > 0 ? `${derived.flags} FLAG${derived.flags === 1 ? '' : 'S'}` : undefined}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Personal readiness dial */}
          <div className="panel flex flex-col items-center justify-center gap-4 p-6 lg:col-span-4">
            <SectionTag code="HERO" name="Readiness" className="w-full" />
            <ReadinessDial
              value={derived.avgReadiness}
              responses={derived.surveyReadings.length}
              flagged={derived.flags}
              size={230}
              label="Personal avg"
              sublabel={
                derived.surveyReadings.length
                  ? `${derived.surveyReadings.length} RESPONSES`
                  : 'NO SURVEYS YET'
              }
            />
          </div>
        </section>

        {/* Messages */}
        <section className="reveal reveal-2 panel overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <SectionTag
              code="02."
              name="Messages"
              right={
                <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                  {msgs.length} TOTAL · LAST 50 SHOWN
                </span>
              }
            />
            <p className="mt-2 text-xs text-[color:var(--bone-mute)]">
              Every message this athlete has exchanged with the team line. Freshest first.
            </p>
          </div>
          {msgs.length === 0 ? (
            <div className="border-t border-[color:var(--hairline)] px-6 py-10 text-center">
              <p className="mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
                — no messages yet —
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[440px] border-t border-[color:var(--hairline)]">
              <ul>
                {msgs.map((m) => {
                  const catTone = CAT_TONE[m.category] ?? CAT_TONE.chat;
                  return (
                    <li
                      key={m.sid}
                      className="border-b border-[color:var(--hairline)]/60 px-5 py-3"
                    >
                      <div className="flex items-start gap-4">
                        <div className="shrink-0 w-[84px] text-right">
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
                                color: catTone.color,
                                background: catTone.bg,
                                border: `1px solid ${catTone.border}`,
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
        </section>

        {/* Activity log */}
        <section className="reveal reveal-3 panel">
          <div className="px-5 pt-4 pb-3">
            <SectionTag
              code="03."
              name="Activity log"
              right={
                <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                  {logs.length} ENTRIES
                </span>
              }
            />
            <p className="mt-2 text-xs text-[color:var(--bone-mute)]">
              Historical workouts and rehabs from the reflect import.
            </p>
          </div>
          {logs.length === 0 ? (
            <div className="border-t border-[color:var(--hairline)] px-6 py-10 text-center">
              <p className="mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
                — no historical activity for this athlete —
              </p>
            </div>
          ) : (
            <ul className="border-t border-[color:var(--hairline)]">
              {logs.map((l) => {
                const tone = l.kind === 'workout' ? CAT_TONE.workout : CAT_TONE.rehab;
                return (
                  <li
                    key={l.id}
                    className="flex items-start gap-4 border-b border-[color:var(--hairline)]/60 px-5 py-3 last:border-0"
                  >
                    <div className="shrink-0 w-[84px] text-right">
                      <div
                        className="mono text-[0.7rem] text-[color:var(--bone-soft)] tabular"
                        title={prettyDateTime(l.logged_at)}
                      >
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
                      <div className="text-sm leading-relaxed text-[color:var(--bone-soft)]">
                        {l.description}
                      </div>
                    </div>
                  </li>
                );
              })}
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
      <dt className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
        {label}
      </dt>
      <dd className={`mt-1 text-[color:var(--bone)] ${mono ? 'mono text-sm' : 'text-sm'}`}>
        {value}
      </dd>
    </div>
  );
}
