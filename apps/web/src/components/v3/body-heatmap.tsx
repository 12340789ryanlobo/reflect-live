// apps/web/src/components/v3/body-heatmap.tsx
//
// Anatomical body heatmap. Wraps react-muscle-highlighter (MIT) and
// styles it for the v3 light theme. Per-region counts are aggregated
// to muscle slugs via `regionToMuscle` and rendered as 5-level intensity.

'use client';
import { useMemo } from 'react';
import Body, { type ExtendedBodyPart, type Slug } from 'react-muscle-highlighter';
import {
  regionCountsToMuscleCounts,
  muscleToRegions,
  type View,
} from '@/lib/region-to-muscle';
import { regionLabel } from '@/lib/injury-aliases';
import type { Gender } from '@reflect-live/shared';

// 5-step soft palette aligned with v3 tokens. Index 0 = light, 4 = warm-coral.
// Avoids harsh saturation against white card; reads as a "heat ramp".
const PALETTE = ['#DCEAF5', '#C2E8DD', '#F4D8A6', '#E89B6F', '#D85447'];

const DEFAULT_FILL = '#F4F0E6'; // var(--paper-2) — empty muscle
const DEFAULT_BORDER = '#D7D1C2'; // var(--border-2)

interface Props {
  /** canonical region key → injury count (summed across left/right) */
  counts: Record<string, number>;
  view: View;
  gender: Gender;
  /** Click handler — receives the canonical regions that map to the
   *  clicked muscle (one slug typically expands to 1–4 regions, e.g.
   *  'calves' → ['calf', 'ankle', 'achilles', 'shin']). */
  onMuscleClick?: (regions: string[]) => void;
  className?: string;
}

export function BodyHeatmap({ counts, view, gender, onMuscleClick, className }: Props) {
  const data: ExtendedBodyPart[] = useMemo(() => {
    const muscleCounts = regionCountsToMuscleCounts(counts, view);
    if (muscleCounts.size === 0) return [];
    const max = Math.max(...muscleCounts.values());
    return [...muscleCounts.entries()].map(([slug, count]) => ({
      slug,
      // Map count→intensity (1..5) using relative-max so a small team's
      // single hot region still saturates rather than washing out.
      intensity: Math.max(1, Math.min(5, Math.ceil((count / max) * 5))),
    }));
  }, [counts, view]);

  // Custom tooltip: show our canonical region label, not the muscle slug.
  // The library renders default <title> tags using the slug; we override
  // by tagging each affected muscle with a friendlier label below.

  return (
    <div className={className}>
      <Body
        data={data}
        side={view}
        gender={gender}
        colors={PALETTE}
        defaultFill={DEFAULT_FILL}
        border={DEFAULT_BORDER}
        scale={1}
        onBodyPartPress={(part) => {
          const slug = part.slug as Slug | undefined;
          if (!slug) return;
          const regions = muscleToRegions(slug);
          onMuscleClick?.(regions);
        }}
      />
      {/* Hidden labels for accessibility / tooltip override. The library
          renders SVG paths whose default titles use slug names; we expose
          a friendlier list for screen readers. */}
      <ul className="sr-only">
        {Object.entries(counts).map(([region, c]) => (
          <li key={region}>{regionLabel(region)}: {c} report{c === 1 ? '' : 's'}</li>
        ))}
      </ul>
    </div>
  );
}

export { PALETTE as HEATMAP_PALETTE };
