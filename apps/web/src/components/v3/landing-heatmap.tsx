'use client';

// Lightweight wrapper around BodyHeatmap for the landing page. The
// real /dashboard/heatmap reads injury_reports + activity_logs from
// supabase; here we feed mock counts so the visual is identical to
// what the user gets in-product. Static counts (no fetching) keep
// the wrapper a single render with no client state.

import { BodyHeatmap } from '@/components/v3/body-heatmap';
import { regionLabel } from '@/lib/injury-aliases';

// Demo counts chosen to look like a realistic mid-season distribution:
// shoulder + lower back are common overuse spots, lower-body work
// shows up via quads/hamstrings/calves. The list reads as 'what a
// coach would actually be tracking,' not 'every region lit up.'
const DEMO_COUNTS: Record<string, number> = {
  shoulder: 4,
  lower_back: 3,
  upper_back: 2,
  hamstring: 2,
  quad: 3,
  calf: 1,
  knee: 1,
  hip: 2,
};

export function LandingHeatmap() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,260px)] gap-6 items-center">
      <div className="flex justify-center">
        <BodyHeatmap counts={DEMO_COUNTS} gender="male" scale={0.78} />
      </div>
      <div>
        <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold mb-2">
          Top regions · last 30d
        </div>
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {Object.entries(DEMO_COUNTS)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([region, count]) => (
              <li
                key={region}
                className="flex items-center justify-between py-2 text-[13px]"
              >
                <span className="text-[color:var(--ink)] font-medium">
                  {regionLabel(region)}
                </span>
                <span className="mono tabular text-[color:var(--ink-mute)]">
                  {count} {count === 1 ? 'report' : 'reports'}
                </span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
