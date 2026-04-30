// apps/web/src/lib/region-to-muscle.ts
//
// Bridge our canonical body regions (BODY_REGIONS in injury-aliases.ts)
// to react-muscle-highlighter's muscle slugs. Each region falls into
// one of four anatomical categories:
//
// 1. MUSCLE GROUPS — paint a 1:1 or composite slug set:
//    hand, forearm, bicep, tricep, upper_back (paints upper-back +
//    trapezius), lower_back, neck, hamstring, quad, calf, shin, chest,
//    abs, obliques.
//    (No 'upper_arm' canonical region. 'upper arm' / 'arm' phrases
//    expand to bicep + tricep [+ forearm] via group aliases in
//    injury-aliases.ts. Each muscle slug is owned by exactly one
//    region — no cross-region painting — so hover tooltips don't
//    cross-reference parent regions.)
//
// 2. JOINTS WITH LIBRARY SHAPES — the library renders an actual joint
//    silhouette, so we paint it directly:
//    knee → knees, ankle → ankles, foot → feet
//
// 3. NO LIBRARY SHAPE — return [] so we don't paint a misleading
//    muscle. The region still tracks in the side-list categories on
//    the injury tab when there's data, just doesn't appear on the
//    body silhouette:
//    elbow, wrist (joints), achilles (tendon),
//    mid_back (no mid-back slug exists in the library; painting
//    upper-back would cross-region with the actual upper_back region)
//
// 4. JOINTS conflated with their dominant surrounding muscle — common
//    athlete vocab (e.g. "shoulder pain" usually means deltoid +
//    rotator-cuff area, not the joint capsule). Acceptable approximation:
//    shoulder → deltoids, hip → gluteal, groin → adductors
//
// Reverse (slug → regions): used when a user clicks a muscle on the
// chart, so the side-panel filter expands to every canonical region
// that maps there.

import type { Slug } from 'react-muscle-highlighter';

export type MuscleSlug = Slug;

// View context for side-dependent regions
export type View = 'front' | 'back';

/**
 * Map a canonical injury region to one or more muscle slugs. Returns an
 * empty array for the 'other' bucket (unmapped reports — shown
 * separately in the UI).
 */
export function regionToMuscles(region: string, view: View = 'front'): MuscleSlug[] {
  switch (region) {
    case 'hand':        return ['hands'];
    // Wrist is a JOINT — no library slug exists for it, and painting
    // forearm for a wrist injury is anatomically misleading (forearm
    // is the muscle, wrist is the joint distal to it). Same treatment
    // as elbow: still a valid injury-report region, just doesn't paint.
    case 'wrist':       return [];
    case 'forearm':     return ['forearm'];
    // bicep / tricep are the only upper-arm regions. 'upper arm' /
    // 'arm' phrases are GROUP aliases that expand to bicep + tricep
    // (+ forearm) — see REGION_GROUP_ALIASES in injury-aliases.ts.
    case 'bicep':       return ['biceps'];
    case 'tricep':      return ['triceps'];
    // Elbow is a JOINT — there's no elbow shape on the silhouette and
    // mapping it to biceps + triceps was anatomically misleading
    // (those are upper-arm muscles, not the elbow). Returning [] keeps
    // 'elbow' as a valid injury-report region — it'll show up in the
    // side-list categories when there's data — without painting any
    // muscle on the body map.
    case 'elbow':       return [];
    case 'shoulder':    return ['deltoids'];
    // upper_back owns the trapezius slug — see comment in the
    // 'Upper back' aliases section in injury-aliases.ts. Each muscle
    // slug should be painted by exactly one region so hover tooltips
    // don't cross-reference 'Upper Back (Neck)'.
    case 'upper_back':  return ['upper-back', 'trapezius'];
    // No mid_back slug exists. Same treatment as elbow/wrist/achilles:
    // mid-back injuries track in the side-list categories when reported,
    // they just don't paint a misleading shape on the silhouette.
    case 'mid_back':    return [];
    case 'lower_back':  return ['lower-back'];
    case 'neck':        return ['neck'];
    case 'hip':         return ['gluteal'];
    case 'groin':       return ['adductors'];
    case 'hamstring':   return ['hamstring'];
    case 'quad':        return ['quadriceps'];
    case 'knee':        return ['knees'];
    case 'calf':        return ['calves'];
    case 'shin':        return ['tibialis'];
    case 'ankle':       return ['ankles'];
    case 'foot':        return ['feet'];
    // Achilles is a tendon connecting gastroc + soleus to the heel.
    // No separate slug exists for it on the silhouette, and painting
    // calves was misleading — calf is the muscle, achilles is the
    // tendon below; conflating them in the hover tooltip ('Calf
    // (Achilles)') confused readers. Treat like elbow / wrist:
    // returns [] for body painting, still tracked in the side-list
    // categories on the injury tab when reported.
    case 'achilles':    return [];
    case 'chest':       return ['chest'];
    // abs is the front core; obliques is its own canonical region now.
    // The library has separate `abs` and `obliques` slugs and only
    // renders obliques on the front view.
    case 'abs':         return ['abs'];
    case 'obliques':    return view === 'front' ? ['obliques'] : [];
    default:            return [];              // 'other' or unknown
  }
}

/**
 * Single-slug shim for callers that just want the primary muscle (e.g.
 * to compare with a clicked slug). Returns the first slug from the
 * multi-slug map, or null when nothing matches.
 */
export function regionToMuscle(region: string, view: View = 'front'): MuscleSlug | null {
  const slugs = regionToMuscles(region, view);
  return slugs[0] ?? null;
}

/**
 * Reverse map: which canonical regions resolve to this slug? Used to
 * expand the side-panel filter when the user clicks a muscle on the
 * chart.
 */
const ALL_REGIONS = [
  'hand', 'wrist', 'forearm', 'elbow',
  'bicep', 'tricep', 'shoulder',
  'upper_back', 'mid_back', 'lower_back', 'neck',
  'hip', 'groin', 'hamstring', 'quad', 'knee', 'calf',
  'shin', 'ankle', 'foot', 'achilles', 'chest', 'abs', 'obliques',
];

export function muscleToRegions(slug: MuscleSlug): string[] {
  // Pool both views so click-expansion is symmetric (clicking biceps on
  // the front view should still surface elbow + upper_arm reports, even
  // if some were originally tagged with the back-side viewpoint).
  const matches = new Set<string>();
  for (const r of ALL_REGIONS) {
    const front = regionToMuscles(r, 'front');
    const back = regionToMuscles(r, 'back');
    if (front.includes(slug) || back.includes(slug)) {
      matches.add(r);
    }
  }
  return [...matches];
}

/**
 * Aggregate per-region counts into per-muscle counts for rendering.
 * Side-dependent regions (elbow, upper_arm) contribute to whichever
 * muscle is showing on the active view. Multi-slug regions (e.g. abs →
 * abs + obliques) contribute to every slug they paint.
 */
export function regionCountsToMuscleCounts(
  counts: Record<string, number>,
  view: View,
): Map<MuscleSlug, number> {
  const out = new Map<MuscleSlug, number>();
  for (const [region, count] of Object.entries(counts)) {
    if (count === 0) continue;
    for (const slug of regionToMuscles(region, view)) {
      out.set(slug, (out.get(slug) ?? 0) + count);
    }
  }
  return out;
}
