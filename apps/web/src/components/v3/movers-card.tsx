'use client';

import Link from 'next/link';
import { useEngagement } from '@/lib/use-engagement';
import type { EngagementRow } from '@/lib/engagement';
import { TrendingUp, TrendingDown } from 'lucide-react';

// baseline-rounded → window count, e.g. "2 → 6"
function moveLabel(r: EngagementRow): string {
  return `${Math.round(r.baselineRate)} → ${r.windowCount}`;
}

function MoverRow({ r, dir }: { r: EngagementRow; dir: 'up' | 'down' }) {
  return (
    <li>
      <Link
        href={`/dashboard/players/${r.player_id}`}
        className="flex items-center justify-between gap-3 border-b px-6 py-2.5 transition hover:bg-[color:var(--card-hover)] last:border-b-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-[color:var(--ink)] truncate">{r.name}</div>
          <div className="text-[11px] text-[color:var(--ink-mute)] truncate">{r.group ?? 'No group'}</div>
        </div>
        <span
          className="tabular text-[12.5px] font-semibold shrink-0"
          style={{ color: dir === 'up' ? 'var(--green)' : 'var(--amber)' }}
        >
          {moveLabel(r)}
        </span>
      </Link>
    </li>
  );
}

function Column({
  title,
  icon,
  rows,
  dir,
}: {
  title: string;
  icon: React.ReactNode;
  rows: EngagementRow[];
  dir: 'up' | 'down';
}) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-1.5 px-6 pt-4 pb-2">
        {icon}
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-[color:var(--ink-mute)]">{title}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-6 text-[12.5px] text-[color:var(--ink-mute)]">—</p>
      ) : (
        <ul>{rows.map((r) => <MoverRow key={r.player_id} r={r} dir={dir} />)}</ul>
      )}
    </div>
  );
}

export function MoversCard({
  teamId,
  windowDays,
  groupFilter = null,
}: {
  teamId: number;
  windowDays: number | null;
  groupFilter?: string | null;
}) {
  const { rows, loading } = useEngagement(teamId, windowDays, groupFilter);

  // "all" has no baseline → show one ranked "most active overall" list.
  const isAll = windowDays == null;

  const heating = rows
    .filter((r) => r.bucket === 'heating')
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 4);
  const cooling = rows
    .filter((r) => r.bucket === 'cooling')
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 4);
  const mostActive = [...rows]
    .filter((r) => r.windowCount > 0)
    .sort((a, b) => b.windowCount - a.windowCount)
    .slice(0, 6);

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold text-[color:var(--ink)]">{isAll ? 'Most active' : 'Movers'}</h2>
      </header>
      {loading ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
      ) : isAll ? (
        mostActive.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— no activity —</p>
        ) : (
          <ul>{mostActive.map((r) => <MoverRow key={r.player_id} r={r} dir="up" />)}</ul>
        )
      ) : heating.length === 0 && cooling.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— steady week, no movers —</p>
      ) : (
        <div className="flex flex-col sm:flex-row sm:divide-x" style={{ borderColor: 'var(--border)' }}>
          <Column title="Heating up" icon={<TrendingUp className="size-3.5" style={{ color: 'var(--green)' }} />} rows={heating} dir="up" />
          <Column title="Cooling off" icon={<TrendingDown className="size-3.5" style={{ color: 'var(--amber)' }} />} rows={cooling} dir="down" />
        </div>
      )}
    </section>
  );
}
