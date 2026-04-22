'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { SectionTag } from '@/components/section-tag';
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

  return (
    <>
      <PageHeader
        code="A4"
        eyebrow="Database"
        title="The"
        italic="database."
        subtitle={loading ? 'COUNTING…' : `${totals.toLocaleString()} ROWS · ${rows.length} TABLES`}
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* Highlights */}
        <section className="reveal reveal-1 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag code="A4·A" name="Highlighted tables" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 md:grid-cols-4">
            {highlightRows.map((r) => (
              <StatReadout
                key={r.name}
                label={r.name}
                value={r.count.toLocaleString()}
                sub={r.note.toUpperCase()}
                tone={
                  r.name === 'players'
                    ? 'heritage'
                    : r.name === 'twilio_messages'
                    ? 'signal'
                    : r.name === 'activity_logs'
                    ? 'chlorine'
                    : 'amber'
                }
              />
            ))}
          </div>
        </section>

        {/* Full table counts */}
        <section className="reveal reveal-2 panel overflow-hidden">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag
              code="A4·B"
              name="All tables"
              right={
                <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                  {rows.length} · {totals.toLocaleString()} ROWS
                </span>
              }
            />
          </div>
          {loading ? (
            <p className="px-6 py-8 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — loading counts —
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--hairline)] bg-[color:var(--panel-raised)]/40">
                  <th className="px-4 py-3 text-left mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                    Table
                  </th>
                  <th className="px-4 py-3 text-right mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                    Rows
                  </th>
                  <th className="px-4 py-3 text-left mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-b border-[color:var(--hairline)]/50">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 mono text-sm text-[color:var(--bone)]">
                        <span className="text-[color:var(--bone-dim)]">{r.icon}</span>
                        {r.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right num-display text-lg tabular">
                      {r.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-[color:var(--bone-mute)]">
                      {r.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
