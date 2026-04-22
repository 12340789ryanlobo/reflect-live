'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatReadout } from '@/components/stat-readout';
import { SectionTag } from '@/components/section-tag';
import { WorkerHealthCard } from '@/components/worker-health-card';
import { useSupabase } from '@/lib/supabase-browser';
import { Users, MessageSquareText, Activity, Shield, Database, Cpu, Building2 } from 'lucide-react';

interface AdminCounts {
  users: number;
  messages: number;
  activity: number;
}

export default function AdminOverview() {
  const { prefs } = useDashboard();
  const sb = useSupabase();
  const [counts, setCounts] = useState<AdminCounts>({ users: 0, messages: 0, activity: 0 });

  useEffect(() => {
    (async () => {
      const [{ count: users }, { count: msgs }, { count: acts }] = await Promise.all([
        sb.from('user_preferences').select('clerk_user_id', { count: 'exact', head: true }),
        sb.from('twilio_messages').select('sid', { count: 'exact', head: true }).eq('team_id', prefs.team_id),
        sb.from('activity_logs').select('id', { count: 'exact', head: true }).eq('team_id', prefs.team_id),
      ]);
      setCounts({ users: users ?? 0, messages: msgs ?? 0, activity: acts ?? 0 });
    })();
  }, [sb, prefs.team_id]);

  const quickLinks: Array<{ href: string; code: string; title: string; description: string; icon: React.ComponentType<{ className?: string }>; accent: string }> = [
    {
      href: '/dashboard/admin/users',
      code: 'A1',
      title: 'Users & roles',
      description: 'Invite, promote, or demote. Assign roster links.',
      icon: Users,
      accent: 'hsl(188 82% 58%)',
    },
    {
      href: '/dashboard/admin/teams',
      code: 'A2',
      title: 'Teams',
      description: 'Create teams, edit Twilio credentials.',
      icon: Building2,
      accent: 'hsl(358 78% 58%)',
    },
    {
      href: '/dashboard/admin/system',
      code: 'A3',
      title: 'System',
      description: 'Worker health, polls, error state.',
      icon: Cpu,
      accent: 'hsl(162 62% 54%)',
    },
    {
      href: '/dashboard/admin/database',
      code: 'A4',
      title: 'Database',
      description: 'Table counts, row totals, snapshot.',
      icon: Database,
      accent: 'hsl(38 90% 62%)',
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Admin overview"
        title="Admin"
        italic="room."
        subtitle="FULL-ACCESS PANEL"
      />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
        {/* Top readouts */}
        <section className="reveal reveal-1 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag name="System summary" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 md:grid-cols-4">
            <StatReadout
              label="Total users"
              value={counts.users}
              sub="REGISTERED"
              tone="heritage"
            />
            <StatReadout
              label="Total messages"
              value={counts.messages}
              sub="TWILIO-INDEXED"
              tone="signal"
            />
            <StatReadout
              label="Total activity"
              value={counts.activity}
              sub="REFLECT IMPORT"
              tone="chlorine"
            />
            <WorkerHealthCard />
          </div>
        </section>

        {/* Quick links grid */}
        <section className="reveal reveal-2 panel">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag name="Control panels" />
          </div>
          <div className="grid grid-cols-1 gap-0 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map(({ href, code, title, description, icon: Icon, accent }, i) => (
              <Link
                key={href}
                href={href}
                className={`group relative flex flex-col gap-3 p-5 transition hover:bg-[color:var(--panel-raised)]/50 ${
                  i < quickLinks.length - 1 ? 'border-b border-[color:var(--hairline)] md:border-r xl:border-b-0' : ''
                } ${i === 0 ? 'xl:border-r xl:border-[color:var(--hairline)]' : ''} ${
                  i === 1 ? 'md:border-r-0 md:border-b xl:border-r xl:border-b-0' : ''
                } ${i === 2 ? 'md:border-b-0 xl:border-r xl:border-[color:var(--hairline)]' : ''}`}
              >
                <div
                  aria-hidden
                  className="absolute left-0 top-0 h-[2px] w-full origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                  style={{ background: accent }}
                />
                <div className="flex items-center gap-3">
                  <div
                    className="grid size-10 place-items-center rounded-sm border"
                    style={{
                      color: accent,
                      borderColor: accent + '55',
                      background: accent + '14',
                    }}
                  >
                    <Icon className="size-5" />
                  </div>
                  <span className="mono text-[0.68rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                    {code}
                  </span>
                </div>
                <div className="h-serif text-xl font-semibold text-[color:var(--bone)]">
                  {title}
                </div>
                <p className="text-sm text-[color:var(--bone-mute)] leading-snug">
                  {description}
                </p>
                <span className="mt-auto mono text-[0.66rem] uppercase tracking-[0.22em] text-[color:var(--bone-dim)] group-hover:text-[color:var(--signal)] transition">
                  OPEN →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
