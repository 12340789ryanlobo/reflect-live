export interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
  };
}

export interface SnapshotTarget { id: number; team_id: number; }

export interface WeatherRow {
  location_id: number;
  team_id: number;
  temp_c: number | null;
  precip_mm: number | null;
  wind_kph: number | null;
  humidity_pct: number | null;
  condition_code: number | null;
}

export async function fetchWeather(
  { lat, lon }: { lat: number; lon: number },
  f: typeof fetch = fetch,
): Promise<OpenMeteoResponse> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,weather_code`;
  const res = await f(url);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  return res.json() as Promise<OpenMeteoResponse>;
}

export function toSnapshot(resp: OpenMeteoResponse, loc: SnapshotTarget): WeatherRow {
  const c = resp.current ?? {};
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  return {
    location_id: loc.id,
    team_id: loc.team_id,
    temp_c: num(c.temperature_2m),
    precip_mm: num(c.precipitation),
    wind_kph: num(c.wind_speed_10m),
    humidity_pct: num(c.relative_humidity_2m),
    condition_code: num(c.weather_code),
  };
}
