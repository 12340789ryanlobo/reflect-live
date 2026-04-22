import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchWeather, toSnapshot } from './weather';
import { updateWorkerState } from './state';

export async function pollWeatherOnce(sb: SupabaseClient): Promise<number> {
  const { data: locs, error } = await sb.from('locations').select('id,team_id,lat,lon');
  if (error) throw error;
  if (!locs?.length) {
    await updateWorkerState(sb, { last_weather_poll_at: new Date().toISOString() });
    return 0;
  }
  const rows = [];
  for (const l of locs) {
    try {
      const resp = await fetchWeather({ lat: l.lat, lon: l.lon });
      rows.push(toSnapshot(resp, { id: l.id, team_id: l.team_id }));
    } catch (err) {
      console.error('[weather] fetch failed for loc %d: %s', l.id, err);
    }
  }
  if (rows.length) {
    const { error: insErr } = await sb.from('weather_snapshots').insert(rows);
    if (insErr) throw insErr;
  }
  await updateWorkerState(sb, { last_weather_poll_at: new Date().toISOString() });
  return rows.length;
}
