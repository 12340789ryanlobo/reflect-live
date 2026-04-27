'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { useSupabase } from '@/lib/supabase-browser';
import {
  Database,
  Users,
  MessageSquareText,
  Activity,
  MapPin,
  Cloud,
  Cpu,
  Settings,
} from 'lucide-react';
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

  const highlightTone = (name: string): 'blue' | 'default' | 'green' | 'amber' => {
    if (name === 'players') return 'blue';
    if (name === 'twilio_messages') return 'default';
    if (name === 'activity_logs') return 'green';
    return 'amber';
  };

  return (
    <>
      <PageHeader
        eyebrow="Tables"
        title="Database"
        subtitle={loading ? 'Counting…' : `${totals.toLocaleString()} rows · ${rows.length} tables`}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Highlight stats */}
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
            {highlightRows.map((r) => (
              <div key={r.name} className="p-6">
                <StatCell
                  label={r.name}
                  value={r.count.toLocaleString()}
                  sub={r.note}
                  tone={highlightTone(r.name)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* All tables */}
        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">All tables</h2>
            <span className="text-[12px] text-[color:var(--ink-mute)]">
              {rows.length} · {totals.toLocaleString()} rows
            </span>
          </header>
          {loading ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading counts…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                      Table
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                      Rows
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 mono text-[13px] text-[color:var(--ink)]">
                          <span className="text-[color:var(--ink-mute)]">{r.icon}</span>
                          {r.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular font-semibold text-[15px]">
                        {r.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[color:var(--ink-mute)]">
                        {r.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
