'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { Metric } from '@/components/metric-card';
import { WorkerHealthCard } from '@/components/worker-health-card';
import { useSupabase } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  const quickLinks = [
    { href: '/dashboard/admin/users', title: 'Users & roles', description: 'Invite, promote, or demote users', icon: Users },
    { href: '/dashboard/admin/teams', title: 'Teams', description: 'Create teams, manage Twilio credentials', icon: Building2 },
    { href: '/dashboard/admin/system', title: 'System', description: 'Worker health, polls, errors', icon: Cpu },
    { href: '/dashboard/admin/database', title: 'Database', description: 'Table counts, data snapshot', icon: Database },
  ];

  return (
    <>
      <PageHeader title="Admin overview" subtitle={<Badge variant="destructive">Admin only</Badge>} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Total users" value={counts.users} sub="registered" tone="primary" icon={<Shield className="size-4" />} />
          <Metric label="Total messages" value={counts.messages} sub="Twilio-indexed" icon={<MessageSquareText className="size-4" />} />
          <Metric label="Total activity" value={counts.activity} sub="reflect import" tone="success" icon={<Activity className="size-4" />} />
          <WorkerHealthCard />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {quickLinks.map(({ href, title, description, icon: Icon }) => (
            <Link key={href} href={href} className="group">
              <Card className="h-full transition hover:border-primary/60 hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="h-serif text-lg">{title}</CardTitle>
                      <CardDescription>{description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="text-xs text-primary underline-offset-4 group-hover:underline">Open →</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
