'use client';

// Adapted from magicui (https://magicui.design/r/magic-card.json).
// Two adjustments from the upstream version:
//
//   1. Dropped the next-themes dependency. reflect-live is light-mode
//      only, so the dark/light branching for the orb's mix-blend-mode
//      is hard-coded to 'multiply' (the light-mode value). Less code,
//      one less prop, no theme-mounted hydration flicker.
//
//   2. Default colors retuned to reflect-live's --blue palette so the
//      hover gradient looks like part of the brand instead of pasted-in
//      magicui purple.
//
// Behavior: a soft radial gradient follows the cursor inside the card
// border; on hover, an inner gradient layer fades in to highlight
// content. Only renders on devices with a pointer (mouse) — touch
// users see the static card.

import React, { useCallback, useEffect, useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { cn } from '@/lib/utils';

interface MagicCardProps {
  children?: React.ReactNode;
  className?: string;
  gradientSize?: number;
  gradientColor?: string;
  gradientOpacity?: number;
  gradientFrom?: string;
  gradientTo?: string;
}

export function MagicCard({
  children,
  className,
  gradientSize = 240,
  gradientColor = 'var(--blue-soft)',
  gradientOpacity = 0.55,
  gradientFrom = '#1F5FB0',
  gradientTo = '#3F7AC4',
}: MagicCardProps) {
  const mouseX = useMotionValue(-gradientSize);
  const mouseY = useMotionValue(-gradientSize);
  const gradientSizeRef = useRef(gradientSize);

  useEffect(() => {
    gradientSizeRef.current = gradientSize;
  }, [gradientSize]);

  const reset = useCallback(() => {
    const off = -gradientSizeRef.current;
    mouseX.set(off);
    mouseY.set(off);
  }, [mouseX, mouseY]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    },
    [mouseX, mouseY],
  );

  useEffect(() => {
    reset();
  }, [reset]);

  // Border gradient is always painted (off-screen at rest, follows the
  // cursor on hover). Inner spotlight fades in via group-hover so the
  // resting state stays clean.
  return (
    <motion.div
      className={cn(
        'group relative isolate overflow-hidden rounded-[inherit] border border-transparent',
        className,
      )}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      style={{
        background: useMotionTemplate`
          linear-gradient(var(--card) 0 0) padding-box,
          radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
            ${gradientFrom},
            ${gradientTo},
            var(--border) 100%
          ) border-box
        `,
      }}
    >
      <div
        className="absolute inset-px z-20 rounded-[inherit]"
        style={{ background: 'var(--card)' }}
      />
      <motion.div
        suppressHydrationWarning
        className="pointer-events-none absolute inset-px z-30 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
              ${gradientColor},
              transparent 100%
            )
          `,
          opacity: gradientOpacity,
        }}
      />
      <div className="relative z-40">{children}</div>
    </motion.div>
  );
}
