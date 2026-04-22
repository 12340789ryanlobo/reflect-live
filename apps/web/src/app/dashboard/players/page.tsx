'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Metric } from '@/components/metric-card';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Star, Users, Activity } from 'lucide-react';
import { prettyPhone, relativeTime } from '@/lib/format';

interface PlayerRow extends Player {
  last_inbound: string | null;
  workouts_30d: number;
  rehabs_30d: number;
}

export default function PlayersPage() {
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const router = useRouter();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string>('all');

  useEffect(() => {
    (async () => {
      const { data: players } = await sb.from('players').select('*').eq('team_id', prefs.team_id).order('name');
      const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: msgs } = await sb.from('twilio_messages')
        .select('player_id,direction,category,date_sent')
        .eq('team_id', prefs.team_id)
        .gte('date_sent', since30);
      const msgList = (msgs ?? []) as Array<{ player_id: number | null; direction: string; category: string; date_sent: string }>;

      const lastInboundByPlayer = new Map<number, string>();
      const workoutByPlayer = new Map<number, number>();
      const rehabByPlayer = new Map<number, number>();
      for (const m of msgList) {
        if (m.player_id == null) continue;
        if (m.direction === 'inbound') {
          const prev = lastInboundByPlayer.get(m.player_id);
          if (!prev || m.date_sent > prev) lastInboundByPlayer.set(m.player_id, m.date_sent);
        }
        if (m.category === 'workout') workoutByPlayer.set(m.player_id, (workoutByPlayer.get(m.player_id) ?? 0) + 1);
        if (m.category === 'rehab') rehabByPlayer.set(m.player_id, (rehabByPlayer.get(m.player_id) ?? 0) + 1);
      }

      const enriched: PlayerRow[] = (players ?? []).map((p: Player) => ({
        ...p,
        last_inbound: lastInboundByPlayer.get(p.id) ?? null,
        workouts_30d: workoutByPlayer.get(p.id) ?? 0,
        rehabs_30d: rehabByPlayer.get(p.id) ?? 0,
      }));
      setRows(enriched);
      setLoading(false);
    })();
  }, [sb, prefs.team_id]);

  const groups = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.group) s.add(r.group);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (group !== 'all' && r.group !== group) return false;
      if (q) {
        const rawPhone = (r.phone_e164 ?? '').toLowerCase();
        const prettified = prettyPhone(r.phone_e164).toLowerCase();
        const matches =
          r.name.toLowerCase().includes(q) ||
          rawPhone.includes(q) ||
          prettified.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [rows, search, group]);

  const activeCount = rows.filter((r) => r.last_inbound).length;

  return (
    <>
      <PageHeader title="Players" subtitle={`${rows.length} on roster · ${groups.length} groups`} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Roster" value={rows.length} sub={`${groups.length} groups`} icon={<Users className="size-4" />} />
          <Metric label="Active this month" value={activeCount} sub="replied in last 30 days" tone="success" icon={<Activity className="size-4" />} />
          <Metric label="Starred" value={prefs.watchlist.length} sub="on your watchlist" tone="primary" icon={<Star className="size-4" />} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="h-serif text-lg">Roster ({filtered.length} shown)</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  type="search"
                  placeholder="Search by name or phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-[220px]"
                />
                <Select value={group} onValueChange={setGroup}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <p className="px-6 text-sm italic text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-6 text-sm italic text-muted-foreground">No players match this filter.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Last inbound</TableHead>
                    <TableHead>Workouts 30d</TableHead>
                    <TableHead>Rehabs 30d</TableHead>
                    <TableHead>Star</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const starred = prefs.watchlist.includes(p.id);
                    return (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/player/${p.id}`)}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.group ? <Badge variant="secondary">{p.group}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{prettyPhone(p.phone_e164)}</TableCell>
                        <TableCell className="text-muted-foreground">{relativeTime(p.last_inbound)}</TableCell>
                        <TableCell>{p.workouts_30d}</TableCell>
                        <TableCell>{p.rehabs_30d}</TableCell>
                        <TableCell>
                          {starred ? <Star className="size-4 fill-primary text-primary" /> : <Star className="size-4 text-muted-foreground" />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
