// apps/web/src/components/v3/body-heatmap.tsx
//
// Anatomical body heatmap. Wraps react-muscle-highlighter (MIT) and
// styles it for the v3 light theme. Per-region counts are aggregated
// to muscle slugs via `regionToMuscle` and rendered as 5-level
// intensity. Front and back are shown simultaneously.

'use client';
import { useMemo, useState } from 'react';
import Body, { type ExtendedBodyPart, type Slug } from 'react-muscle-highlighter';
import {
  regionCountsToMuscleCounts,
  regionToMuscles,
  muscleToRegions,
  type View,
} from '@/lib/region-to-muscle';
import { regionLabel } from '@/lib/injury-aliases';
import type { Gender } from '@reflect-live/shared';

interface HoverState {
  label: string;
  x: number;
  y: number;
}

// 5-step soft palette aligned with v3 tokens. Index 0 = light, 4 = warm-coral.
const PALETTE = ['#DCEAF5', '#C2E8DD', '#F4D8A6', '#E89B6F', '#D85447'];

const DEFAULT_FILL = '#F4F0E6'; // var(--paper-2) — empty muscle
const DEFAULT_BORDER = '#D7D1C2'; // var(--border-2)
const HIGHLIGHT_STROKE = '#1F5FB0'; // var(--blue)
const HIGHLIGHT_STROKE_WIDTH = 2.5;

/**
 * Six legend tiers in order: None (empty fill) + five intensity steps
 * matching the colors react-muscle-highlighter paints. The legend UI
 * computes its own labels (count ranges relative to the global max) so
 * we keep this array color-only.
 */
export const DENSITY_TIERS: readonly [string, string, string, string, string, string] = [
  DEFAULT_FILL,  // 0  — None / empty muscle
  PALETTE[0],    // 1  — light blue
  PALETTE[1],    // 2  — mint
  PALETTE[2],    // 3  — tan
  PALETTE[3],    // 4  — coral
  PALETTE[4],    // 5  — red
] as const;

/**
 * Largest single-muscle count across both views, given region counts.
 * react-muscle-highlighter scales colors by intensity = ceil(c/max * 5),
 * so the legend (and both views) need to share one max — otherwise the
 * same region count colors differently on front vs back. This is the
 * shared scale.
 */
export function densityScale(counts: Record<string, number>): number {
  const front = regionCountsToMuscleCounts(counts, 'front');
  const back = regionCountsToMuscleCounts(counts, 'back');
  let m = 0;
  for (const v of front.values()) if (v > m) m = v;
  for (const v of back.values()) if (v > m) m = v;
  return m;
}

/**
 * Count range that maps to a given tier (1–5) for the current scale.
 * Returns `null` when the tier is unreachable (small `max` values can
 * leave gaps because intensity = ceil(c/max*5)). Use the returned
 * `[lo, hi]` to render a label like "1", "5–6", or "—".
 */
export function densityTierRange(tier: 1 | 2 | 3 | 4 | 5, max: number): [number, number] | null {
  if (max <= 0) return null;
  const lo = Math.floor(((tier - 1) * max) / 5) + 1;
  const hi = Math.floor((tier * max) / 5);
  if (lo > hi) return null;
  return [lo, hi];
}

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
  globalMax: number,
): ExtendedBodyPart[] {
  const muscleCounts = regionCountsToMuscleCounts(counts, view);
  // Use a SHARED max across both views so the same region count can't
  // render at different intensities on front vs back.
  const max = globalMax > 0 ? globalMax : 1;
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
      for (const slug of regionToMuscles(r, 'front')) front.add(slug);
      for (const slug of regionToMuscles(r, 'back')) back.add(slug);
    }
    return { frontSelected: front, backSelected: back };
  }, [selectedRegions]);

  const globalMax = useMemo(() => densityScale(counts), [counts]);

  const dataFront = useMemo(
    () => buildSideData(counts, 'front', frontSelected, globalMax),
    [counts, frontSelected, globalMax],
  );
  const dataBack = useMemo(
    () => buildSideData(counts, 'back', backSelected, globalMax),
    [counts, backSelected, globalMax],
  );

  function handleClick(part: ExtendedBodyPart) {
    if (!onMuscleClick) return;
    const slug = part.slug as Slug | undefined;
    if (!slug) return;
    onMuscleClick(muscleToRegions(slug));
  }

  // Hover-tooltip state. The library renders each muscle <path> with
  // id={bodyPart.slug}, so we resolve the hovered slug via event
  // delegation on the wrapper, look up the canonical regions it maps
  // to, and show "Region Name · N session(s)".
  const [hover, setHover] = useState<HoverState | null>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as Element | null;
    const path = target?.closest('path');
    const slug = path?.id;
    if (!slug) {
      if (hover) setHover(null);
      return;
    }
    const regions = muscleToRegions(slug as Slug);
    if (regions.length === 0) {
      if (hover) setHover(null);
      return;
    }
    const labels = regions.map(regionLabel).join(' / ');
    const total = regions.reduce((sum, r) => sum + (counts[r] ?? 0), 0);
    const display = total > 0
      ? `${labels} · ${total} session${total === 1 ? '' : 's'}`
      : labels;
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({
      label: display,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  function handleMouseLeave() {
    setHover(null);
  }

  return (
    <div
      className={`relative ${className ?? ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {hover && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 rounded-md border bg-[color:var(--paper)] px-2 py-1 text-[11.5px] font-semibold text-[color:var(--ink)] shadow-sm whitespace-nowrap"
          style={{
            borderColor: 'var(--border)',
            // 12px offset from cursor so the pointer doesn't sit on top
            // of the label and prevent further mousemove tracking.
            left: hover.x + 12,
            top: hover.y + 12,
          }}
        >
          {hover.label}
        </div>
      )}
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

