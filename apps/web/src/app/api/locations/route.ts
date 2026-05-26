// /api/locations  — coach-managed events + training sites (the
// `locations` table). The Events page reads via the browser client
// (RLS), so this route only handles writes.
//
// POST   — create an event / training site (coach or admin).
// (GET is intentionally absent — the page reads locations directly.)
//
// Geocoding: if the caller passes a `place` string and no lat/lon,
// we resolve coordinates via Open-Meteo's keyless geocoding API so
// weather tracking works without the coach knowing coordinates. A
// failed geocode is non-fatal — the location is created with null
// coords (no weather) rather than erroring the whole request.

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { captureWeatherSnapshot } from '@/lib/weather-snapshot';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function requireCoach(teamId: number) {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const;
  const sb = serviceClient();
  const { data: prefs } = await sb
    .from('user_preferences')
    .select('is_platform_admin')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ is_platform_admin: boolean | null }>();
  if (prefs?.is_platform_admin) return { sb } as const;
  const { data: m } = await sb
    .from('team_memberships')
    .select('role, status')
    .eq('clerk_user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle<{ role: string; status: string }>();
  if (m?.status === 'active' && m.role === 'coach') return { sb } as const;
  return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) } as const;
}

/** Resolve a place name to coordinates via Open-Meteo geocoding
 *  (keyless, same provider the weather poll already uses). Returns
 *  null on no-match or network error — caller treats as "no weather". */
async function geocode(place: string): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
    const r = await fetch(url, { next: { revalidate: 86_400 } });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country_code?: string }> };
    const hit = j.results?.[0];
    if (!hit) return null;
    const label = [hit.name, hit.admin1, hit.country_code].filter(Boolean).join(', ');
    return { lat: hit.latitude, lon: hit.longitude, label };
  } catch {
    return null;
  }
}

interface CreateBody {
  team_id?: unknown;
  name?: unknown;
  kind?: unknown;          // 'meet' | 'training'
  event_date?: unknown;    // YYYY-MM-DD (meets); null for training
  place?: unknown;         // optional place name to geocode
  lat?: unknown;           // optional explicit coords (skip geocode)
  lon?: unknown;
}

export async function POST(req: Request) {
  let body: CreateBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const teamId = Number(body.team_id);
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'bad_team_id' }, { status: 400 });

  const gate = await requireCoach(teamId);
  if ('error' in gate) return gate.error;
  const { sb } = gate;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (name.length > 160) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });

  const kind = body.kind === 'training' ? 'training' : 'meet';

  // Meets carry a date; training sites don't. Validate when present.
  let eventDate: string | null = null;
  if (kind === 'meet') {
    const d = typeof body.event_date === 'string' ? body.event_date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: 'event_date_required', detail: 'meets need a YYYY-MM-DD date' }, { status: 400 });
    }
    eventDate = d;
  }

  // Resolve coordinates. Explicit lat/lon win; otherwise geocode the
  // place name; otherwise leave null (no weather).
  let lat: number | null = null;
  let lon: number | null = null;
  let geocodedLabel: string | null = null;
  if (typeof body.lat === 'number' && typeof body.lon === 'number') {
    lat = body.lat; lon = body.lon;
  } else if (typeof body.place === 'string' && body.place.trim()) {
    const g = await geocode(body.place.trim());
    if (g) { lat = g.lat; lon = g.lon; geocodedLabel = g.label; }
  }

  const { data, error } = await sb
    .from('locations')
    .insert({ team_id: teamId, name, kind, event_date: eventDate, lat, lon })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });

  // Grab weather now so the chip shows immediately rather than waiting
  // for the worker's next 10-minute poll.
  if (lat != null && lon != null) {
    await captureWeatherSnapshot(sb, data.id, teamId, lat, lon);
  }

  return NextResponse.json({ location: data, geocoded: geocodedLabel });
}

export const dynamic = 'force-dynamic';
