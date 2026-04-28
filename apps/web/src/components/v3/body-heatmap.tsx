// apps/web/src/components/v3/body-heatmap.tsx
//
// Anatomical body heatmap. Wraps react-muscle-highlighter (MIT) and
// styles it for the v3 light theme. Per-region counts are aggregated
// to muscle slugs via `regionToMuscle` and rendered as 5-level
// intensity. Front and back are shown simultaneously.

'use client';
import { useMemo } from 'react';
import Body, { type ExtendedBodyPart, type Slug } from 'react-muscle-highlighter';
import {
  regionCountsToMuscleCounts,
  regionToMuscle,
  muscleToRegions,
  type View,
} from '@/lib/region-to-muscle';
import { regionLabel } from '@/lib/injury-aliases';
import type { Gender } from '@reflect-live/shared';

// 5-step soft palette aligned with v3 tokens. Index 0 = light, 4 = warm-coral.
const PALETTE = ['#DCEAF5', '#C2E8DD', '#F4D8A6', '#E89B6F', '#D85447'];

const DEFAULT_FILL = '#F4F0E6'; // var(--paper-2) — empty muscle
const DEFAULT_BORDER = '#D7D1C2'; // var(--border-2)
const HIGHLIGHT_STROKE = '#1F5FB0'; // var(--blue)
const HIGHLIGHT_STROKE_WIDTH = 2.5;

interface Props {
  counts: Record<string, number>;
  gender: Gender;
  selectedRegions?: string[];
  onMuscleClick?: (regions: string[]) => void;
  /** Per-side scale; the library's natural size is ~380px, so 1 = full,
   *  0.5 = half. Tune this from the page based on available width. */
  scale?: number;
  className?: string;
}

function buildSideData(
  counts: Record<string, number>,
  view: View,
  selectedSlugs: Set<Slug>,
): ExtendedBodyPart[] {
  const muscleCounts = regionCountsToMuscleCounts(counts, view);
  const max = muscleCounts.size === 0 ? 1 : Math.max(...muscleCounts.values());
  const data: ExtendedBodyPart[] = [];

  for (const [slug, count] of muscleCounts) {
    const intensity = Math.max(1, Math.min(5, Math.ceil((count / max) * 5)));
    const styles = selectedSlugs.has(slug)
      ? { stroke: HIGHLIGHT_STROKE, strokeWidth: HIGHLIGHT_STROKE_WIDTH }
      : undefined;
    data.push({ slug, intensity, ...(styles ? { styles } : {}) });
  }

  // Selected muscles that don't have any count yet — still highlight them
  // (with a soft blue fill) so the click reads as a highlight.
  for (const slug of selectedSlugs) {
    if (!muscleCounts.has(slug)) {
      data.push({
        slug,
        styles: {
          fill: '#E8F0F9', // var(--blue-soft)
          stroke: HIGHLIGHT_STROKE,
          strokeWidth: HIGHLIGHT_STROKE_WIDTH,
        },
      });
    }
  }

  return data;
}

export function BodyHeatmap({
  counts,
  gender,
  selectedRegions,
  onMuscleClick,
  scale = 0.5,
  className,
}: Props) {
  // Resolve which muscle slugs should be highlighted for each side.
  const { frontSelected, backSelected } = useMemo(() => {
    const front = new Set<Slug>();
    const back = new Set<Slug>();
    for (const r of selectedRegions ?? []) {
      const f = regionToMuscle(r, 'front');
      const b = regionToMuscle(r, 'back');
      if (f) front.add(f);
      if (b) back.add(b);
    }
    return { frontSelected: front, backSelected: back };
  }, [selectedRegions]);

  const dataFront = useMemo(
    () => buildSideData(counts, 'front', frontSelected),
    [counts, frontSelected],
  );
  const dataBack = useMemo(
    () => buildSideData(counts, 'back', backSelected),
    [counts, backSelected],
  );

  function handleClick(part: ExtendedBodyPart) {
    if (!onMuscleClick) return;
    const slug = part.slug as Slug | undefined;
    if (!slug) return;
    onMuscleClick(muscleToRegions(slug));
  }

  return (
    <div className={className}>
      <div className="flex items-start justify-center gap-2">
        <div className="flex flex-col items-center gap-1.5">
          <Body
            data={dataFront}
            side="front"
            gender={gender}
            colors={PALETTE}
            defaultFill={DEFAULT_FILL}
            border={DEFAULT_BORDER}
            scale={scale}
            onBodyPartPress={handleClick}
          />
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
            Front
          </span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <Body
            data={dataBack}
            side="back"
            gender={gender}
            colors={PALETTE}
            defaultFill={DEFAULT_FILL}
            border={DEFAULT_BORDER}
            scale={scale}
            onBodyPartPress={handleClick}
          />
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
            Back
          </span>
        </div>
      </div>
      {/* Hidden labels for accessibility */}
      <ul className="sr-only">
        {Object.entries(counts).map(([region, c]) => (
          <li key={region}>{regionLabel(region)}: {c} report{c === 1 ? '' : 's'}</li>
        ))}
      </ul>
    </div>
  );
}

export { PALETTE as HEATMAP_PALETTE };
