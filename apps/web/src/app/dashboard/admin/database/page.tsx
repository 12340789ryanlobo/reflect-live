'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { Metric } from '@/components/metric-card';
import { useSupabase } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, Users, MessageSquareText, Activity, MapPin, Cloud, Cpu, Settings } from 'lucide-react';
import type { ReactNode } from 'react';

interface CountRow {
  name: string;
  count: number;
  icon: ReactNode;
  note: string;
}

const ICON: Record<string, ReactNode> = {
  teams: <Database className="size-4" />,
  players: <Users className="size-4" />,
  twilio_messages: <MessageSquareText className="size-4" />,
  activity_logs: <Activity className="size-4" />,
  locations: <MapPin className="size-4" />,
  weather_snapshots: <Cloud className="size-4" />,
  worker_state: <Cpu className="size-4" />,
  user_preferences: <Settings className="size-4" />,
};

const TABLES = [
  { name: 'teams', note: 'Team identity' },
  { name: 'players', note: 'Roster' },
  { name: 'twilio_messages', note: 'Indexed SMS (dedup on sid)' },
  { name: 'activity_logs', note: 'Historical workouts + rehabs' },
  { name: 'locations', note: 'Training + meet venues' },
  { name: 'weather_snapshots', note: 'Open-Meteo polls' },
  { name: 'worker_state', note: 'Cursor + health' },
  { name: 'user_preferences', note: 'Watchlists, roles' },
];

export default function AdminDatabasePage() {
  const sb = useSupabase();
  const [rows, setRows] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const results = await Promise.all(
        TABLES.map(async (t) => {
          const { count } = await sb.from(t.name).select('*', { count: 'exact', head: true });
          return { name: t.name, note: t.note, count: count ?? 0, icon: ICON[t.name] };
        }),
      );
      setRows(results);
      setLoading(false);
    })();
  }, [sb]);

  const totals = rows.reduce((a, r) => a + r.count, 0);
  const highlights = ['players', 'twilio_messages', 'activity_logs', 'weather_snapshots'];
  const highlightRows = rows.filter((r) => highlights.includes(r.name));

  return (
    <>
      <PageHeader title="Database" subtitle={<Badge variant="destructive">Admin only</Badge>} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          {highlightRows.map((r) => (
            <Metric key={r.name} label={r.name} value={r.count} sub={r.note} icon={r.icon} />
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="h-serif text-lg">Table counts</CardTitle>
            <CardDescription>{loading ? 'Counting…' : `${totals} rows across ${rows.length} tables`}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <p className="px-6 text-sm italic text-muted-foreground">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 font-mono text-sm">
                          <span className="text-muted-foreground">{r.icon}</span>
                          {r.name}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{r.count.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{r.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
