import { describe, it, expect, vi } from 'vitest';
import { fetchWeather, toSnapshot } from '../src/weather';

describe('toSnapshot', () => {
  it('maps Open-Meteo response to snapshot row', () => {
    const resp = {
      current: {
        temperature_2m: 12.4,
        precipitation: 0.1,
        wind_speed_10m: 18.3,
        relative_humidity_2m: 72,
        weather_code: 3,
      },
    };
    const row = toSnapshot(resp, { id: 1, team_id: 1 });
    expect(row).toMatchObject({
      location_id: 1,
      team_id: 1,
      temp_c: 12.4,
      precip_mm: 0.1,
      wind_kph: 18.3,
      humidity_pct: 72,
      condition_code: 3,
    });
  });

  it('tolerates missing current block', () => {
    const row = toSnapshot({}, { id: 1, team_id: 1 });
    expect(row.temp_c).toBeNull();
  });
});

describe('fetchWeather', () => {
  it('calls Open-Meteo with correct query', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ current: { temperature_2m: 10 } }),
    })) as unknown as typeof fetch;
    await fetchWeather({ lat: 41.79, lon: -87.60 }, mockFetch);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('latitude=41.79'),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('longitude=-87.6'),
    );
  });
});
