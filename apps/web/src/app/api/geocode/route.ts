// GET /api/geocode?q=...  — place search for the Events location picker.
//
// Proxies OpenStreetMap's Nominatim geocoder (keyless, free). We use
// Nominatim instead of Open-Meteo's geocoder because Open-Meteo only
// indexes populated places (cities/towns) — coaches kept failing to
// add universities, stadiums, and other venues. Nominatim indexes all
// of those.
//
// Why server-side: Nominatim's usage policy requires a descriptive
// User-Agent, which browsers can't set, and proxying avoids CORS. We
// keep it light (limit=6, debounced on the client) to stay well within
// their fair-use guidance.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

interface NominatimHit {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string>;
}

/** Build a short, readable label from Nominatim's verbose display_name.
 *  Prefers "<name>, <city>, <state>"; falls back to the first few
 *  comma-separated chunks of display_name. */
function shortLabel(hit: NominatimHit): string {
  const a = hit.address ?? {};
  const primary = hit.name || a.amenity || a.building || a.leisure || display0(hit.display_name);
  const city = a.city || a.town || a.village || a.hamlet || a.county;
  const region = a.state || a.region;
  const parts = [primary, city, region].filter((p, i, arr) => p && arr.indexOf(p) === i);
  if (parts.length >= 2) return parts.join(', ');
  // Fallback: first three segments of the raw display_name.
  return hit.display_name.split(',').slice(0, 3).map((s) => s.trim()).join(', ');
}

function display0(displayName: string): string {
  return displayName.split(',')[0]?.trim() ?? displayName;
}

export async function GET(req: Request) {
  // Require a signed-in user — this proxy is only for the in-app picker.
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=6`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'reflect-live/1.0 (athlete-wellness dashboard; contact ryanlobo@uchicago.edu)',
        'Accept-Language': 'en',
      },
      // Nominatim results change rarely; cache identical queries for a day.
      next: { revalidate: 86_400 },
    });
    if (!r.ok) return NextResponse.json({ results: [], error: `nominatim_${r.status}` });
    const hits = (await r.json()) as NominatimHit[];
    const results = hits.map((h) => ({
      id: h.place_id,
      label: shortLabel(h),
      lat: Number(h.lat),
      lon: Number(h.lon),
    })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ results: [], error: (e as Error).message });
  }
}

export const dynamic = 'force-dynamic';
