'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { TwilioMessage, Category, Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionTag } from '@/components/section-tag';
import { buildPhoneIndex, prettyCategory, prettyPhone, relativeTime } from '@/lib/format';

const CATS: Array<{ value: Category | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'workout', label: 'Workouts' },
  { value: 'rehab', label: 'Rehabs' },
  { value: 'survey', label: 'Check-ins' },
  { value: 'chat', label: 'Chat' },
];

const CAT_TONE: Record<Category, { color: string; bg: string; border: string }> = {
  workout: { color: 'hsl(162 62% 54%)', bg: 'hsl(162 40% 18% / 0.4)', border: 'hsl(162 40% 40%)' },
  rehab:   { color: 'hsl(38 90% 62%)',  bg: 'hsl(38 60% 20% / 0.4)',  border: 'hsl(38 60% 40%)' },
  survey:  { color: 'hsl(188 82% 58%)', bg: 'hsl(188 60% 20% / 0.4)', border: 'hsl(188 60% 40%)' },
  chat:    { color: 'hsl(36 10% 62%)',  bg: 'hsl(220 14% 14%)',       border: 'hsl(220 14% 24%)' },
};

function clockStamp(ts: string): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * LiveFeed — "THE WIRE"
 *
 * A broadcast-ticker style stream. Each row is a time-stamped entry with
 * a station-code time (hh:mm:ss), a category pill, the sender name (or
 * a phone when the roster doesn't resolve), and the message body.
 * New entries slide in with a cyan accent stripe that fades.
 */
export function LiveFeed({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      const [{ data: m }, { data: p }] = await Promise.all([
        sb.from('twilio_messages').select('*').eq('team_id', teamId).order('date_sent', { ascending: false }).limit(100),
        sb.from('players').select('*').eq('team_id', teamId),
      ]);
      if (!cancelled) {
        if (m) setMsgs(m as TwilioMessage[]);
        if (p) setPlayers(p as Player[]);
      }
    })();
    const ch = sb
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'twilio_messages', filter: `team_id=eq.${teamId}` },
        (pl) => {
          const next = pl.new as TwilioMessage;
          setMsgs((prev) => [next, ...prev].slice(0, 200));
          setNewIds((prev) => new Set(prev).add(next.sid));
          setTimeout(() => {
            if (!mountedRef.current) return;
            setNewIds((prev) => {
              const n = new Set(prev);
              n.delete(next.sid);
              return n;
            });
          }, 2400);
        },
      )
      .subscribe();
    return () => {
      mountedRef.current = false;
      cancelled = true;
      sb.removeChannel(ch);
    };
  }, [sb, teamId]);

  const phoneIndex = useMemo(() => buildPhoneIndex(players), [players]);
  const playerByIdMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const filtered = filter === 'all' ? msgs : msgs.filter((m) => m.category === filter);

  function resolvePlayer(m: TwilioMessage): Player | null {
    if (m.player_id) return playerByIdMap.get(m.player_id) ?? null;
    const raw = m.direction === 'inbound' ? m.from_number : m.to_number;
    const clean = (raw ?? '').replace(/^(whatsapp|sms):/i, '');
    return phoneIndex.get(clean) ?? null;
  }

  function otherPartyPhone(m: TwilioMessage): string | null {
    const raw = m.direction === 'inbound' ? m.from_number : m.to_number;
    return raw ? raw.replace(/^(whatsapp|sms):/i, '') : null;
  }

  return (
    <div className="panel overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <SectionTag
          name="Messages"
          right={
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Category | 'all')}>
              <TabsList className="h-8 bg-[color:var(--panel-raised)] border border-[color:var(--hairline)]">
                {CATS.map((c) => (
                  <TabsTrigger
                    key={c.value}
                    value={c.value}
                    className="text-[0.72rem] mono uppercase tracking-wider data-[state=active]:bg-[color:var(--panel-over)] data-[state=active]:text-[color:var(--signal)]"
                  >
                    {c.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        />
      </div>

      {filtered.length === 0 ? (
        <div className="border-t border-[color:var(--hairline)] px-6 py-10 text-center">
          <p className="mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
            — no signals in this filter —
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[440px] border-t border-[color:var(--hairline)]">
          <ul>
            {filtered.map((m, i) => {
              const player = resolvePlayer(m);
              const otherPhone = otherPartyPhone(m);
              const senderLabel = player ? player.name : 'Unknown';
              const catTone = CAT_TONE[m.category] ?? CAT_TONE.chat;
              return (
                <li
                  key={m.sid}
                  className={`group border-b border-[color:var(--hairline)]/60 px-5 py-3 transition hover:bg-[color:var(--panel-raised)]/40 ${
                    newIds.has(m.sid) ? 'slide-in-row' : ''
                  } ${i === 0 ? 'pt-3' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Time column */}
                    <div className="shrink-0 w-[88px] text-right">
                      <div className="mono text-[0.7rem] text-[color:var(--signal)] tabular">
                        {clockStamp(m.date_sent)}
                      </div>
                      <div className="mono text-[0.62rem] text-[color:var(--bone-dim)] tabular mt-0.5">
                        {relativeTime(m.date_sent, now)}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="shrink-0 w-px self-stretch bg-[color:var(--hairline)]" />

                    {/* Content */}
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
                        {player ? (
                          <Link
                            href={`/dashboard/player/${player.id}`}
                            className="text-sm font-semibold text-[color:var(--bone)] hover:text-[color:var(--signal)] transition"
                          >
                            {senderLabel}
                          </Link>
                        ) : (
                          <span className="text-sm font-semibold text-[color:var(--bone-mute)]">
                            {senderLabel}
                          </span>
                        )}
                        {!player && (
                          <span className="mono text-[0.62rem] text-[color:var(--bone-dim)] uppercase tracking-wider">
                            {prettyPhone(otherPhone)}
                          </span>
                        )}
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
  );
}

