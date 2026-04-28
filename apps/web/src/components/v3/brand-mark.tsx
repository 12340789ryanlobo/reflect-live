// apps/web/src/components/v3/brand-mark.tsx
//
// The reflect logomark — a circle bisected into a top dome and a bottom
// smile, with a small ripple breaking the dome at the apex. Reads as
// reflection on water (the top form mirrored as the bottom form, with
// the bisecting line as the surface) and the ripple is the live pulse
// disturbing it. Designed to scale from 16px (favicon) up to 64px+.
//
// Adapted from the AI-generated brand exploration; refined with thicker
// stroke, rounder caps, tighter geometry for crispness at small sizes.

interface Props {
  size?: number;
  /** When true, omit the small wave detail at the apex. Used at favicon
   *  sizes where the wave is sub-pixel anyway. */
  simplified?: boolean;
  className?: string;
}

export function BrandMark({ size = 32, simplified = false, className }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="reflect"
      className={className}
    >
      {/* Top dome with optional ripple/wave detail */}
      {simplified ? (
        <path d="M 14 50 C 14 26, 30 14, 50 14 C 70 14, 86 26, 86 50" />
      ) : (
        <path d="M 14 50
                 C 14 26, 30 14, 42 14
                 Q 46 23, 50 15
                 Q 54 23, 58 14
                 C 70 14, 86 26, 86 50" />
      )}
      {/* Water/mirror line */}
      <line x1="16" y1="50" x2="84" y2="50" />
      {/* Bottom smile / reflection */}
      <path d="M 22 56 Q 50 86, 78 56" />
    </svg>
  );
}
