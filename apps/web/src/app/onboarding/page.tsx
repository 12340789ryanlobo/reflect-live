'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TeamPub { id: number; name: string; code: string; description: string | null; }

export default function Onboarding() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamPub[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/teams-public');
      const j = await r.json();
      const ts = j.teams ?? [];
      setTeams(ts);
      if (ts.length === 1) setPickedId(ts[0].id);
      setLoading(false);
    })();
  }, []);

  async function save() {
    if (!pickedId) return;
    setSaving(true);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ team_id: pickedId, watchlist: [], group_filter: null }),
    });
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/40">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="h-serif text-2xl">Welcome to reflect-live</CardTitle>
          <CardDescription>
            Pick the team you&apos;re part of. Roles are assigned by your team admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading teams…</p>
          ) : teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teams have been set up yet. Contact your admin to create one, then come back here.
            </p>
          ) : teams.length === 1 ? (
            <>
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Team</div>
                <div className="font-medium">{teams[0].name}</div>
                {teams[0].description && <div className="text-sm text-muted-foreground mt-1">{teams[0].description}</div>}
              </div>
              <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Setting up…' : `Join ${teams[0].name}`}</Button>
            </>
          ) : (
            <>
              <Select value={pickedId ? String(pickedId) : ''} onValueChange={(v) => setPickedId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Pick your team…" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={save} disabled={saving || !pickedId} className="w-full">{saving ? 'Setting up…' : 'Continue'}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
