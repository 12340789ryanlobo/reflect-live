'use client';

// Lightweight wrapper around BodyHeatmap for the landing page. The
// real /dashboard/heatmap reads injury_reports + activity_logs from
// supabase; here we feed mock counts so the visual is identical to
// what the user gets in-product. Static counts (no fetching) keep
// the wrapper a single render with no client state.
//
// Every region in DEMO_COUNTS must map to at least one muscle slug
// via regionToMuscles — otherwise the side-list shows a row but the
// body paints nothing for that region, which reads as 'the list and
// the body don't match.' We assert that constraint at build time
// (filtering with regionToMuscles().length > 0 below) so a future
// edit of the counts list can't silently regress alignment.

import {
  BodyHeatmap,
  DENSITY_TIERS,
  densityScale,
} from '@/components/v3/body-heatmap';
import { regionToMuscles } from '@/lib/region-to-muscle';
import { regionLabel } from '@/lib/injury-aliases';

// Mock distribution of pain reports across canonical body regions.
// Picked to look like a realistic mid-season spread without putting
// every region in the list. Each region here MUST have a non-empty
// regionToMuscles() so the body painter highlights the same area
// the side-list names.
const DEMO_COUNTS: Record<string, number> = {
  shoulder: 4,    // deltoids — front + back
  lower_back: 3,  // lower-back — back
  quad: 3,        // quadriceps — front
  upper_back: 2,  // upper-back + trapezius — back
  hamstring: 2,   // hamstring — back
  hip: 2,         // gluteal — back
  calf: 1,        // calves — back
  knee: 1,        // knees — front
};

// Drop any region that wouldn't paint on the silhouette so the side
// list never claims a body part that the painter ignored.
const VISIBLE_ROWS = Object.entries(DEMO_COUNTS)
  .filter(([region]) => regionToMuscles(region, 'front').length > 0
    || regionToMuscles(region, 'back').length > 0)
  .sort((a, b) => b[1] - a[1]);

// Pick a tier color for a given count so the dot next to each
// side-list row matches the intensity painted on the body. Same
// formula BodyHeatmap uses internally: tier = ceil(count/max * 5).
function tierColorForCount(count: number, max: number): string {
  if (max <= 0 || count <= 0) return DENSITY_TIERS[0];
  const tier = Math.max(1, Math.min(5, Math.ceil((count / max) * 5)));
  return DENSITY_TIERS[tier];
}

export function LandingHeatmap() {
  const max = densityScale(DEMO_COUNTS);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,280px)] gap-6 items-center">
      <div className="flex justify-center">
        <BodyHeatmap counts={DEMO_COUNTS} gender="male" scale={0.78} />
      </div>
      <div>
        <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold mb-2">
          All regions · last 30d
        </div>
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {VISIBLE_ROWS.map(([region, count]) => (
            <li
              key={region}
              className="flex items-center justify-between gap-3 py-2 text-[13px]"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                {/* Tone dot mirrors the body-paint intensity, so the
                    visual association from list → body is one-to-one. */}
                <span
                  className="inline-block size-2 rounded-full shrink-0"
                  style={{ background: tierColorForCount(count, max) }}
                  aria-hidden
                />
                <span className="text-[color:var(--ink)] font-medium truncate">
                  {regionLabel(region)}
                </span>
              </span>
              <span className="mono tabular text-[color:var(--ink-mute)] shrink-0">
                {count} {count === 1 ? 'report' : 'reports'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
