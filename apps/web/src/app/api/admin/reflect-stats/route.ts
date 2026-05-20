// GET /api/admin/reflect-stats — read-only proxy that aggregates
// reflect's roster into a count for the admin overview card.
//
// We DON'T sync any reflect data into our DB here — this is purely
// a live read so the admin can see "reflect has X athletes, Y teams"
// alongside reflect-live's own counts.
//
// Auth:
//   - Caller must be a platform admin on reflect-live.
//   - REFLECT_ADMIN_KEY is read from server-side env and never
//     exposed to the browser; the key only sits inside this route's
//     fetch headers.
//
// Failure mode: if REFLECT_URL or REFLECT_ADMIN_KEY isn't set, or
// reflect is unreachable, we return { configured: false } so the
// card can render a graceful empty state instead of erroring the
// whole admin page.

import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin-guard';

interface ReflectPlayer {
  id: number;
  team_id: number;
  name: string;
  phone_e164: string;
  active: 0 | 1;
}

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const reflectUrl = (process.env.REFLECT_URL ?? '').replace(/\/$/, '');
  const adminKey = process.env.REFLECT_ADMIN_KEY ?? '';
  if (!reflectUrl || !adminKey) {
    return NextResponse.json({ configured: false });
  }

  try {
    const r = await fetch(`${reflectUrl}/admin/players`, {
      headers: { 'X-Admin-Key': adminKey },
      // Reflect's /admin/players is cheap and changes slowly. A 30s
      // cache keeps the admin page snappy on repeat visits without
      // hammering reflect.
      next: { revalidate: 30 },
    });
    if (!r.ok) {
      return NextResponse.json(
        { configured: true, error: `reflect_unreachable`, status: r.status },
        { status: 200 },
      );
    }
    const json: { players: ReflectPlayer[] } = await r.json();
    const players = json.players ?? [];
    const teamIds = new Set(players.map((p) => p.team_id));
    return NextResponse.json({
      configured: true,
      total_players: players.length,
      active_players: players.filter((p) => p.active === 1).length,
      teams: teamIds.size,
      reflect_url: reflectUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { configured: true, error: 'reflect_fetch_failed', detail: (e as Error).message },
      { status: 200 },
    );
  }
}

export const dynamic = 'force-dynamic';
