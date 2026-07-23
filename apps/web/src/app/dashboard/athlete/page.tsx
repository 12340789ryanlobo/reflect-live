'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function AthletePage() {
  const { prefs, refresh } = useDashboard();
  const router = useRouter();
  const redirectingPlayerId = prefs.impersonate_player_id;
  const sb = useSupabase();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [saving, setSaving] = useState(false);

  // Canonical URL for an athlete viewing their own data is
  // /dashboard/players/[their-player-id]. Redirect there as soon as we
  // know which player they are. Admins without an impersonation set fall
  // through to the picker below.
  useEffect(() => {
    if (redirectingPlayerId) {
      router.replace(`/dashboard/players/${redirectingPlayerId}`);
    }
  }, [redirectingPlayerId, router]);

  useEffect(() => {
    // Skip the roster load when we're redirecting away.
    if (redirectingPlayerId) return;
    let alive = true;
    (async () => {
      const { data: players } = await sb
        .from('players')
        .select('*')
        .eq('team_id', prefs.team_id)
        .order('name');
      if (!alive) return;
      setAllPlayers((players ?? []) as Player[]);
    })();
    return () => { alive = false; };
  }, [sb, prefs.team_id, redirectingPlayerId]);

  async function setAthlete(playerId: number | null) {
    setSaving(true);
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          team_id: prefs.team_id,
          watchlist: prefs.watchlist,
          group_filter: prefs.group_filter,
          role: playerId ? 'athlete' : 'coach',
          impersonate_player_id: playerId,
        }),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  // Redirecting splash. Without this, the picker flashes for a frame
  // before router.replace lands on /dashboard/players/[id].
  if (redirectingPlayerId) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <p className="text-[13px] text-[color:var(--ink-mute)]">— opening your dashboard —</p>
      </main>
    );
  }

  // Picker — an admin (no impersonation set) picks an athlete to preview
  // that athlete's own view. Selecting one sets impersonate_player_id,
  // which flips redirectingPlayerId on the next render and routes to the
  // canonical /dashboard/players/[id] page.
  return (
    <>
      <PageHeader
        eyebrow="Athlete simulator"
        title="My view"
        subtitle="Pick an athlete to simulate"
      />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-[14px] font-bold text-[color:var(--ink)] mb-2">About athlete view</h2>
          <p className="text-[14px] text-[color:var(--ink-soft)] leading-relaxed">
            Pick any athlete to see the dashboard as <em>they</em> see it —
            only their messages, only their workouts, only their readiness. Useful for previewing
            what an athlete sees before they sign in.
          </p>
        </section>

        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Roster · {allPlayers.length} athletes</h2>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {allPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => setAthlete(p.id)}
                disabled={saving}
                className="group flex items-center gap-3 border-b px-6 py-3 text-left transition hover:bg-[color:var(--card-hover)] disabled:opacity-50"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="grid size-8 place-items-center rounded-md border bg-[color:var(--paper)] text-[11px] font-bold shrink-0" style={{ borderColor: 'var(--border)' }}>
                  {initials(p.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[color:var(--ink)]">
                    {p.name}
                  </div>
                  <div className="text-[12px] text-[color:var(--ink-mute)]">
                    {p.group ?? 'no group'}
                  </div>
                </div>
                <span className="text-[12px] text-[color:var(--ink-dim)]">→</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
