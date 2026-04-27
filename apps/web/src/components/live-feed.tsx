'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { TwilioMessage, Category, Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pill, type PillTone } from './v3/pill';
import { buildPhoneIndex, prettyCategory, prettyPhone, relativeTime } from '@/lib/format';

const CATS: Array<{ value: Category | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'workout', label: 'Workouts' },
  { value: 'rehab', label: 'Rehabs' },
  { value: 'survey', label: 'Check-ins' },
  { value: 'chat', label: 'Chat' },
];

const CAT_TONE: Record<Category, PillTone> = {
  workout: 'green',
  rehab: 'amber',
  survey: 'blue',
  chat: 'mute',
};

function clockHM(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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
    <section
      className="rounded-2xl bg-[color:var(--card)] border"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-[color:var(--ink)]">Messages</h2>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Category | 'all')}>
          <TabsList className="h-9 bg-[color:var(--paper)] border" style={{ borderColor: 'var(--border)' }}>
            {CATS.map((c) => (
              <TabsTrigger
                key={c.value}
                value={c.value}
                className="text-[12px] font-semibold data-[state=active]:bg-[color:var(--card)] data-[state=active]:text-[color:var(--blue)]"
              >
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
          — no messages in this filter —
        </div>
      ) : (
        <ScrollArea className="h-[460px]">
          {filtered.map((m) => {
            const player = resolvePlayer(m);
            const otherPhone = otherPartyPhone(m);
            const senderLabel = player ? player.name : 'Unknown';
            const tone = CAT_TONE[m.category] ?? 'mute';
            const isHighlight = newIds.has(m.sid);
            return (
              <div
                key={m.sid}
                className={`flex items-start gap-4 px-6 py-3.5 border-b last:border-b-0 transition ${isHighlight ? 'slide-in-row' : ''}`}
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="mono text-[12px] font-semibold text-[color:var(--ink-mute)] tabular min-w-[52px] pt-[3px]">
                  {clockHM(m.date_sent)}
                </div>
                <div className="pt-[3px]">
                  <Pill tone={tone}>{prettyCategory(m.category)}</Pill>
                </div>
                <div className="min-w-0 flex-1">
                  {player ? (
                    <Link href={`/dashboard/player/${player.id}`} className="text-[14px] font-semibold text-[color:var(--ink)] hover:text-[color:var(--blue)] transition">
                      {senderLabel}
                    </Link>
                  ) : (
                    <span className="text-[14px] font-semibold text-[color:var(--ink-mute)]">{senderLabel}</span>
                  )}
                  {!player && otherPhone && (
                    <span className="ml-2 text-[11.5px] text-[color:var(--ink-mute)]">{prettyPhone(otherPhone)}</span>
                  )}
                  {m.body && (
                    <div className="mt-0.5 text-[13px] text-[color:var(--ink-soft)] leading-relaxed">{m.body}</div>
                  )}
                  <div className="mt-1 text-[11.5px] text-[color:var(--ink-mute)]">{relativeTime(m.date_sent, now)}</div>
                </div>
              </div>
            );
          })}
        </ScrollArea>
      )}
    </section>
  );
}
