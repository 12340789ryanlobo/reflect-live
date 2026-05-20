'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { WorkerHealthCard } from '@/components/worker-health-card';
import { useSupabase } from '@/lib/supabase-browser';
import { Users, Building2, Cpu, Database } from 'lucide-react';

interface AdminCounts {
  totalPeople: number;
  rosterHeadcount: number;
  engagedAthletes: number;
  dashboardOnly: number;
  messages: number;
  activity: number;
}

interface PerTeamRow {
  team_id: number;
  name: string;
  roster: number;
  engaged_athletes: number;
  clerk_users: number;
}

// Reflect (reflectsalus.app) is the legacy SMS-survey app that
// reflect-live replaces. We capture a one-time count of its rosters
// here so the admin page can show the migration scope. Per-coach
// admin keys (UChicagoMT / UChicagoSwim / UChicagoDive / track) gate
// reflect's data, so a live cross-team query isn't possible without
// embedding all four keys server-side — overkill for what's effectively
// a static "scope of legacy app" number. If the snapshot needs
// refreshing, run scripts/count-legacy-users.ts and update these
// values manually.
const REFLECT_SNAPSHOT = {
  capturedAt: '2026-05-20',
  totalPhones: 108,
  activePhones: 99,
  teams: 4,
} as const;

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
  const [counts, setCounts] = useState<AdminCounts>({
    totalPeople: 0,
    rosterHeadcount: 0,
    engagedAthletes: 0,
    dashboardOnly: 0,
    messages: 0,
    activity: 0,
  });
  const [perTeam, setPerTeam] = useState<PerTeamRow[]>([]);

  useEffect(() => {
    (async () => {
      // Total people = engaged athletes ∪ Clerk users. Computed in
      // /api/admin/people-stats with the service-role client because
      // browser RLS can't see other teams' players. messages +
      // activity stay on the browser client (RLS-scoped to active
      // team, which is fine — those cards are 'on this team').
      const [peopleRes, msgsRes, actsRes] = await Promise.all([
        fetch('/api/admin/people-stats', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : { total_people: 0, engaged_athletes: 0, dashboard_only_users: 0 })),
        sb.from('twilio_messages').select('sid', { count: 'exact', head: true }).eq('team_id', prefs.team_id),
        sb.from('activity_logs').select('id', { count: 'exact', head: true }).eq('team_id', prefs.team_id),
      ]);
      setCounts({
        totalPeople: peopleRes.total_people ?? 0,
        rosterHeadcount: peopleRes.roster_headcount ?? 0,
        engagedAthletes: peopleRes.engaged_athletes ?? 0,
        dashboardOnly: peopleRes.dashboard_only_users ?? 0,
        messages: msgsRes.count ?? 0,
        activity: actsRes.count ?? 0,
      });
      setPerTeam(peopleRes.per_team ?? []);
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
        {/* Top stats. 'Athletes in Salus' = the union of reflect-live's
            roster + reflect's engaged athletes. After the legacy import
            (scripts/import-legacy-teams.ts on 2026-05-20) every reflect
            phone is also a reflect-live phone, so max(roster, reflect)
            happens to equal the precise union — verified via phone-
            level diff:
              reflect-live phones: 109
              reflect phones: 108 (overlap 108, only-in-reflect 0)
              precise union: 109
            If you re-run the legacy import and the overlap changes,
            max() will still be a correct lower bound; for true precision
            re-run the union diff and update the comment. */}
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6">
              <StatCell
                label="Total people"
                value={counts.totalPeople}
                sub={`${counts.rosterHeadcount} on roster · ${counts.dashboardOnly} dashboard-only`}
                tone="blue"
              />
            </div>
            <div className="p-6">
              <StatCell
                label="Athletes in Salus"
                value={Math.max(counts.rosterHeadcount, REFLECT_SNAPSHOT.activePhones)}
                sub={`${counts.engagedAthletes} engaged here · ${REFLECT_SNAPSHOT.activePhones} on reflect (legacy)`}
                tone="green"
              />
            </div>
            <div className="p-6"><StatCell label="Total messages" value={counts.messages} sub="twilio-indexed" /></div>
            <div className="p-6"><StatCell label="Total activity" value={counts.activity} sub="reflect import" /></div>
            <div className="p-6"><WorkerHealthCard /></div>
          </div>
        </section>

        {/* Per-team engagement table. Splits the headline "total
            people" number into how each team contributes, so the
            admin can see at a glance which rosters are actually
            using reflect-live. Engaged = at least one inbound
            message / activity log / response / injury report. */}
        {perTeam.length > 0 && (
          <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold text-[color:var(--ink)]">People by team</h2>
              <span className="text-[11px] text-[color:var(--ink-mute)]">roster · engaged (reported anything) · dashboard users</span>
            </header>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-6 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Team</th>
                  <th className="px-4 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Roster</th>
                  <th className="px-4 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Engaged</th>
                  <th className="px-4 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Dashboard users</th>
                </tr>
              </thead>
              <tbody>
                {perTeam.map((t) => (
                  <tr key={t.team_id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-6 py-3 text-[color:var(--ink)]">{t.name}</td>
                    <td className="px-4 py-3 text-right mono tabular text-[color:var(--ink)]">{t.roster}</td>
                    <td className="px-4 py-3 text-right mono tabular text-[color:var(--ink-soft)]">{t.engaged_athletes}</td>
                    <td className="px-4 py-3 text-right mono tabular text-[color:var(--ink-soft)]">{t.clerk_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Reflect (reflectsalus.app) — static snapshot. Numbers
            captured via scripts/count-legacy-users.ts on the date
            below; reflect uses per-coach admin keys so a live
            cross-team query isn't possible without baking all four
            into the server, and a snapshot is honest framing for a
            legacy app on its way out anyway. */}
        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h2 className="text-base font-bold text-[color:var(--ink)]">Reflect (legacy app)</h2>
              <p className="text-[12px] text-[color:var(--ink-mute)]">
                Snapshot of{' '}
                <a
                  href="https://reflectsalus.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[color:var(--blue)] hover:underline"
                >
                  reflectsalus.app
                </a>{' '}
                rosters captured {REFLECT_SNAPSHOT.capturedAt}
              </p>
            </div>
            <span className="text-[10.5px] uppercase tracking-wide font-semibold text-[color:var(--ink-mute)]">snapshot</span>
          </header>
          <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6"><StatCell label="Athletes" value={REFLECT_SNAPSHOT.totalPhones} sub="across all teams" tone="blue" /></div>
            <div className="p-6"><StatCell label="Active" value={REFLECT_SNAPSHOT.activePhones} sub="receiving surveys" tone="green" /></div>
            <div className="p-6"><StatCell label="Teams" value={REFLECT_SNAPSHOT.teams} sub="distinct rosters" /></div>
          </div>
        </section>

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
