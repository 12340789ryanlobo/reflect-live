import { createClient } from '@supabase/supabase-js';

const LOCATIONS: Array<{ name: string; kind: 'training' | 'meet'; lat: number; lon: number; event_date?: string }> = [
  { name: 'Myers-McLoraine Pool (UChicago)', kind: 'training', lat: 41.7886, lon: -87.6008 },
  { name: 'UAA Championships — Atlanta', kind: 'meet', lat: 33.7490, lon: -84.3880, event_date: '2026-02-14' },
  { name: 'NCAA DIII Nationals — Indianapolis', kind: 'meet', lat: 39.7684, lon: -86.1581, event_date: '2026-03-18' },
  { name: 'Midwest Invitational — Chicago', kind: 'meet', lat: 41.8781, lon: -87.6298, event_date: '2026-01-10' },
  { name: 'Wheaton College Pool', kind: 'meet', lat: 41.8661, lon: -88.1070, event_date: '2025-11-22' },
  { name: 'Carleton College — Northfield, MN', kind: 'meet', lat: 44.4583, lon: -93.1616, event_date: '2026-01-24' },
];

async function main() {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: team, error: terr } = await sb.from('teams').select('id').eq('code', 'uchicago-swim').single();
  if (terr || !team) throw new Error('team not found; run seed.ts first');
  const rows = LOCATIONS.map((l) => ({ ...l, team_id: team.id, event_date: l.event_date ?? null }));
  const { error } = await sb.from('locations').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  console.log(`✓ seeded ${rows.length} locations`);
}

main().catch((e) => { console.error(e); process.exit(1); });
