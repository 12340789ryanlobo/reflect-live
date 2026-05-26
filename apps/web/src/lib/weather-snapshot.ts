// Best-effort immediate weather capture for a location, so a freshly
// created / re-located event shows its weather chip right away instead
// of waiting up to 10 minutes for the worker's next poll. Mirrors the
// worker's fetch + snapshot shape (apps/worker/src/weather.ts).
//
// Failures are swallowed — the worker's recurring poll is the
// source of truth and will fill in a snapshot on its next cycle.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function captureWeatherSnapshot(
  sb: SupabaseClient,
  locationId: number,
  teamId: number,
  lat: number,
  lon: number,
): Promise<void> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,weather_code`;
    const r = await fetch(url);
    if (!r.ok) return;
    const j = (await r.json()) as {
      current?: {
        temperature_2m?: number;
        precipitation?: number;
        wind_speed_10m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
      };
    };
    const c = j.current ?? {};
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    await sb.from('weather_snapshots').insert({
      location_id: locationId,
      team_id: teamId,
      temp_c: num(c.temperature_2m),
      precip_mm: num(c.precipitation),
      wind_kph: num(c.wind_speed_10m),
      humidity_pct: num(c.relative_humidity_2m),
      condition_code: num(c.weather_code),
    });
  } catch {
    // Non-fatal — the worker poll backfills.
  }
}
