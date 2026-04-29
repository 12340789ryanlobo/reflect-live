// apps/web/src/lib/region-to-muscle.ts
//
// Bridge our 22 canonical injury regions (BODY_REGIONS in
// `injury-aliases.ts`) to react-muscle-highlighter's 23 muscle slugs.
//
// Forward (region → slugs): used to render counts on the body chart. A
// single region can light up multiple slugs (e.g. `abs` paints both the
// `abs` and `obliques` shapes; `neck` paints `neck` + the back-only
// `trapezius`).
//
// Reverse (slug → regions): used when a user clicks a muscle on the
// chart, so the side-panel filter expands to *every* canonical region
// that maps there. Without this, clicking 'calves' would show zero
// reports because the team's calf injuries were tagged 'ankle' or
// 'achilles' or 'shin'.
//
// upper_arm and elbow are view-dependent (front shows biceps, back shows
// triceps). Resolved by `regionToMuscles(region, side)`.

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
    case 'wrist':       return ['forearm'];   // no wrist slug; closest muscle
    case 'forearm':     return ['forearm'];
    case 'elbow':       return view === 'front' ? ['biceps'] : ['triceps'];
    case 'upper_arm':   return view === 'front' ? ['biceps'] : ['triceps'];
    case 'shoulder':    return ['deltoids'];
    // upper_back also lights up the trapezius on the back view, since
    // lats/rhomboids/scaps text aliases collapse here and overlap visually.
    case 'upper_back':  return view === 'back' ? ['upper-back', 'trapezius'] : ['upper-back'];
    case 'mid_back':    return ['upper-back'];   // no mid_back slug; nearest
    case 'lower_back':  return ['lower-back'];
    // neck lights up the cervical neck slug + the trapezius on the back
    // (text aliases trap/traps/trapezius collapse to the neck region).
    case 'neck':        return view === 'back' ? ['neck', 'trapezius'] : ['neck'];
    case 'hip':         return ['gluteal'];
    case 'groin':       return ['adductors'];
    case 'hamstring':   return ['hamstring'];
    case 'quad':        return ['quadriceps'];
    case 'knee':        return ['knees'];
    case 'calf':        return ['calves'];
    case 'shin':        return ['tibialis'];
    case 'ankle':       return ['ankles'];
    case 'foot':        return ['feet'];
    case 'achilles':    return ['calves'];      // no achilles slug; nearest
    case 'chest':       return ['chest'];
    // abs aliases include 'oblique(s)' (see injury-aliases.ts), so abs
    // counts paint both the abs and obliques shapes on the front.
    case 'abs':         return view === 'front' ? ['abs', 'obliques'] : ['abs'];
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
  'hand', 'wrist', 'forearm', 'elbow', 'upper_arm', 'shoulder',
  'upper_back', 'mid_back', 'lower_back', 'neck',
  'hip', 'groin', 'hamstring', 'quad', 'knee', 'calf',
  'shin', 'ankle', 'foot', 'achilles', 'chest', 'abs',
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
