// /api/locations/[id]  — edit / delete a single event or training site.
// PATCH  — coach or admin: name, kind, event_date, coords (or re-geocode via place).
// DELETE — coach or admin: removes the location + its weather_snapshots.

import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { Location } from '@reflect-live/shared';
import { captureWeatherSnapshot } from '@/lib/weather-snapshot';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function loadAndGate(id: number) {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const;
  const sb = serviceClient();
  const { data: loc } = await sb.from('locations').select('*').eq('id', id).maybeSingle<Location>();
  if (!loc) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const;

  const { data: prefs } = await sb
    .from('user_preferences')
    .select('is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean | null }>();
  if (prefs?.is_platform_admin) return { sb, loc } as const;

  const { data: m } = await sb
    .from('team_memberships')
    .select('role, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', loc.team_id)
    .maybeSingle<{ role: string; status: string }>();
  if (m?.status === 'active' && m.role === 'coach') return { sb, loc } as const;
  return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) } as const;
}

async function geocode(place: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
    const r = await fetch(url, { next: { revalidate: 86_400 } });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: Array<{ latitude: number; longitude: number }> };
    const hit = j.results?.[0];
    return hit ? { lat: hit.latitude, lon: hit.longitude } : null;
  } catch {
    return null;
  }
}

interface PatchBody {
  name?: unknown;
  kind?: unknown;
  event_date?: unknown;  // string | null
  place?: unknown;       // re-geocode
  lat?: unknown;
  lon?: unknown;
  place_label?: unknown; // label for explicit coords
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: PatchBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const gate = await loadAndGate(id);
  if ('error' in gate) return gate.error;
  const { sb } = gate;

  const patch: Record<string, unknown> = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) return NextResponse.json({ error: 'name_invalid' }, { status: 400 });
    patch.name = body.name.trim();
  }
  if ('kind' in body) patch.kind = body.kind === 'training' ? 'training' : 'meet';
  if ('event_date' in body) {
    if (body.event_date === null) patch.event_date = null;
    else if (typeof body.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.event_date)) patch.event_date = body.event_date;
    else return NextResponse.json({ error: 'event_date_invalid' }, { status: 400 });
  }
  if (typeof body.lat === 'number' && typeof body.lon === 'number') {
    patch.lat = body.lat; patch.lon = body.lon;
    patch.place_label = typeof body.place_label === 'string' && body.place_label.trim() ? body.place_label.trim() : null;
  } else if (typeof body.place === 'string' && body.place.trim()) {
    const g = await geocode(body.place.trim());
    if (g) { patch.lat = g.lat; patch.lon = g.lon; }
  } else if (body.lat === null || body.lon === null) {
    // Explicit clear → drop weather tracking + its label.
    patch.lat = null; patch.lon = null; patch.place_label = null;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });

  const { data, error } = await sb.from('locations').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });

  // If coords were just set/changed, capture weather now so the chip
  // updates immediately instead of waiting for the worker's next poll.
  if (typeof patch.lat === 'number' && typeof patch.lon === 'number') {
    await captureWeatherSnapshot(sb, id, data.team_id as number, patch.lat as number, patch.lon as number);
  }

  return NextResponse.json({ location: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const gate = await loadAndGate(id);
  if ('error' in gate) return gate.error;
  const { sb } = gate as { sb: SupabaseClient };

  // weather_snapshots FK-references locations(id) with no cascade, so
  // clear the child rows before deleting the parent.
  const { error: wErr } = await sb.from('weather_snapshots').delete().eq('location_id', id);
  if (wErr) return NextResponse.json({ error: 'weather_cleanup_failed', detail: wErr.message }, { status: 500 });
  const { error } = await sb.from('locations').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
