'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { TwilioMessage, Category, Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildPhoneIndex, prettyCategory, prettyDirection, prettyPhone, relativeTime } from '@/lib/format';

const CATS: Array<{ value: Category | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'workout', label: 'Workouts' },
  { value: 'rehab', label: 'Rehabs' },
  { value: 'survey', label: 'Check-ins' },
  { value: 'chat', label: 'Chat' },
];

const CAT_VARIANT: Record<Category, React.ComponentProps<typeof Badge>['variant']> = {
  workout: 'default',
  rehab: 'secondary',
  survey: 'outline',
  chat: 'outline',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function LiveFeed({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const mountedRef = useRef(true);

  // Tick every 30s so relative times stay fresh
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
    const ch = sb.channel('messages').on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'twilio_messages', filter: `team_id=eq.${teamId}` },
      (pl) => {
        const next = pl.new as TwilioMessage;
        setMsgs((prev) => [next, ...prev].slice(0, 200));
        setNewIds((prev) => new Set(prev).add(next.sid));
        setTimeout(() => {
          if (!mountedRef.current) return;
          setNewIds((prev) => { const n = new Set(prev); n.delete(next.sid); return n; });
        }, 2200);
      }).subscribe();
    return () => { mountedRef.current = false; cancelled = true; sb.removeChannel(ch); };
  }, [sb, teamId]);

  const phoneIndex = useMemo(() => buildPhoneIndex(players), [players]);
  const playerByIdMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const filtered = filter === 'all' ? msgs : msgs.filter((m) => m.category === filter);

  function resolvePlayer(m: TwilioMessage): Player | null {
    if (m.player_id) return playerByIdMap.get(m.player_id) ?? null;
    // For outbound messages, the Twilio account is the sender — the player is the recipient.
    const raw = m.direction === 'inbound' ? m.from_number : m.to_number;
    const clean = (raw ?? '').replace(/^(whatsapp|sms):/i, '');
    return phoneIndex.get(clean) ?? null;
  }

  function otherPartyPhone(m: TwilioMessage): string | null {
    const raw = m.direction === 'inbound' ? m.from_number : m.to_number;
    return raw ? raw.replace(/^(whatsapp|sms):/i, '') : null;
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="h-serif text-lg">Live feed</CardTitle>
            <CardDescription>Messages streaming in from the team, in real time</CardDescription>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Category | 'all')}>
            <TabsList>
              {CATS.map((c) => <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground italic">No messages in this filter yet.</p>
        ) : (
          <ScrollArea className="h-[440px]">
            <ul className="divide-y">
              {filtered.map((m) => {
                const player = resolvePlayer(m);
                const otherPhone = otherPartyPhone(m);
                const senderLabel = player ? player.name : 'Unknown sender';
                const senderSub = player ? (player.group ?? prettyPhone(otherPhone)) : prettyPhone(otherPhone);
                return (
                  <li key={m.sid} className={`px-5 py-3 transition ${newIds.has(m.sid) ? 'slide-in-row' : ''}`}>
                    <div className="flex items-start gap-3">
                      <Avatar className="size-8 shrink-0 mt-0.5">
                        <AvatarImage alt={senderLabel} />
                        <AvatarFallback className="text-[10px] font-medium">
                          {player ? initials(player.name) : '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {player ? (
                            <Link href={`/dashboard/player/${player.id}`} className="text-sm font-medium hover:underline">
                              {senderLabel}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-muted-foreground">{senderLabel}</span>
                          )}
                          <Badge variant={CAT_VARIANT[m.category] ?? 'outline'} className="text-[10px]">
                            {prettyCategory(m.category)}
                          </Badge>
                          <span className="text-xs text-muted-foreground tabular ml-auto">{relativeTime(m.date_sent, now)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {senderSub}{player ? '' : ' · no roster match'} · {prettyDirection(m.direction)}
                        </div>
                        {m.body && <div className="mt-1 text-sm leading-snug">{m.body}</div>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
