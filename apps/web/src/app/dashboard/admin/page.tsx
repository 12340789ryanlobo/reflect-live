'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { WorkerHealthCard } from '@/components/worker-health-card';
import { useSupabase } from '@/lib/supabase-browser';
import { Users, Building2, Cpu, Database } from 'lucide-react';

interface AdminCounts {
  users: number;
  messages: number;
  activity: number;
}

interface ReflectStats {
  configured: boolean;
  total_players?: number;
  active_players?: number;
  teams?: number;
  reflect_url?: string;
  error?: string;
}

const quickLinks: Array<{
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    href: '/dashboard/admin/users',
    title: 'Users',
    description: 'Overview of every account, role, and which roster row they map to.',
    icon: Users,
  },
  {
    href: '/dashboard/admin/teams',
    title: 'Teams',
    description: 'Create teams, edit Twilio credentials.',
    icon: Building2,
  },
  {
    href: '/dashboard/admin/system',
    title: 'System',
    description: 'Worker health, polls, error state.',
    icon: Cpu,
  },
  {
    href: '/dashboard/admin/database',
    title: 'Database',
    description: 'Table counts, row totals, snapshot.',
    icon: Database,
  },
];

export default function AdminOverview() {
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [counts, setCounts] = useState<AdminCounts>({ users: 0, messages: 0, activity: 0 });
  const [reflectStats, setReflectStats] = useState<ReflectStats | null>(null);

  useEffect(() => {
    (async () => {
      // Total user count goes through /api/users (service-role) so we
      // bypass the user_preferences RLS policy that limits the browser
      // client to seeing only the caller's own row. messages + activity
      // stay on the browser client because they're scoped to the
      // active team anyway and RLS allows that read.
      const [usersRes, msgsRes, actsRes, reflectRes] = await Promise.all([
        fetch('/api/users', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { users: [] })),
        sb.from('twilio_messages').select('sid', { count: 'exact', head: true }).eq('team_id', prefs.team_id),
        sb.from('activity_logs').select('id', { count: 'exact', head: true }).eq('team_id', prefs.team_id),
        fetch('/api/admin/reflect-stats', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { configured: false })),
      ]);
      setCounts({
        users: (usersRes.users ?? []).length,
        messages: msgsRes.count ?? 0,
        activity: actsRes.count ?? 0,
      });
      setReflectStats(reflectRes);
    })();
  }, [sb, prefs.team_id]);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Admin"
        subtitle="Full-access panel"
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Top stats */}
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6"><StatCell label="Total users" value={counts.users} sub="registered" tone="blue" /></div>
            <div className="p-6"><StatCell label="Total messages" value={counts.messages} sub="twilio-indexed" /></div>
            <div className="p-6"><StatCell label="Total activity" value={counts.activity} sub="reflect import" tone="green" /></div>
            <div className="p-6"><WorkerHealthCard /></div>
          </div>
        </section>

        {/* Reflect (reflectsalus.app) — live, read-only. Surfaces the
            scope of the legacy app so we can compare "how many
            athletes are on reflect" vs "how many users on reflect-live"
            at a glance. No data is imported into our DB; this is a
            proxy call gated by the admin guard + server-side
            REFLECT_ADMIN_KEY. */}
        {reflectStats && reflectStats.configured && !reflectStats.error && (
          <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-base font-bold text-[color:var(--ink)]">Reflect (legacy app)</h2>
                <p className="text-[12px] text-[color:var(--ink-mute)]">
                  Live read from{' '}
                  <a
                    href={reflectStats.reflect_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[color:var(--blue)] hover:underline"
                  >
                    {reflectStats.reflect_url?.replace(/^https?:\/\//, '')}
                  </a>
                </p>
              </div>
              <span className="text-[10.5px] uppercase tracking-wide font-semibold text-[color:var(--ink-mute)]">read-only</span>
            </header>
            <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
              <div className="p-6"><StatCell label="Athletes" value={reflectStats.total_players ?? 0} sub="across all teams" tone="blue" /></div>
              <div className="p-6"><StatCell label="Active" value={reflectStats.active_players ?? 0} sub="receiving surveys" tone="green" /></div>
              <div className="p-6"><StatCell label="Teams" value={reflectStats.teams ?? 0} sub="distinct rosters" /></div>
            </div>
          </section>
        )}
        {reflectStats && !reflectStats.configured && (
          <section className="reveal reveal-2 rounded-2xl border p-6 text-[12px] text-[color:var(--ink-mute)]" style={{ borderColor: 'var(--border)', background: 'var(--paper-2)' }}>
            <span className="font-semibold text-[color:var(--ink)]">Reflect stats unavailable.</span>{' '}
            Add <span className="mono text-[11px]">REFLECT_URL</span> and{' '}
            <span className="mono text-[11px]">REFLECT_ADMIN_KEY</span> to env to enable this card.
          </section>
        )}
        {reflectStats?.error && (
          <section className="reveal reveal-2 rounded-2xl border p-6 text-[12px]" style={{ borderColor: 'var(--red)', background: 'var(--red-soft)', color: 'var(--red)' }}>
            Reflect call failed: {reflectStats.error}
          </section>
        )}

        {/* Quick links */}
        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Control panels</h2>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-x sm:divide-y-0" style={{ borderColor: 'var(--border)' }}>
            {quickLinks.map(({ href, title, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-3 p-6 transition hover:bg-[color:var(--card-hover)]"
              >
                <div
                  className="grid size-10 place-items-center rounded-md"
                  style={{ background: 'color-mix(in srgb, var(--blue) 12%, transparent)', color: 'var(--blue)' }}
                >
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[color:var(--ink)]">{title}</div>
                  <p className="text-[13px] text-[color:var(--ink-mute)] leading-snug mt-0.5">{description}</p>
                </div>
                <span
                  className="text-[12px] font-semibold transition group-hover:underline underline-offset-4"
                  style={{ color: 'var(--blue)' }}
                >
                  Open →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
