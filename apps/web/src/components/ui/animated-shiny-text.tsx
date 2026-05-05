// Sourced from magicui (https://magicui.design/r/animated-shiny-text.json),
// adapted to use the local `shimmer` keyframe defined in globals.css
// instead of the magicui-config-tied `animate-shiny-text` utility.
//
// A horizontal light-glare gradient pans across the text on a slow
// loop (8s), giving section eyebrows a subtle 'live' feel without
// being distracting. Color is the gradient itself — the underlying
// text color isn't changed, so falling back at SSR or with motion
// disabled still reads correctly.

import { type ComponentPropsWithoutRef, type CSSProperties, type FC } from 'react';
import { cn } from '@/lib/utils';

export interface AnimatedShinyTextProps extends ComponentPropsWithoutRef<'span'> {
  shimmerWidth?: number;
}

export const AnimatedShinyText: FC<AnimatedShinyTextProps> = ({
  children,
  className,
  shimmerWidth = 80,
  ...props
}) => {
  return (
    <span
      style={
        {
          '--shiny-width': `${shimmerWidth}px`,
        } as CSSProperties
      }
      className={cn(
        // Base color — passed through className from caller.
        // Shine = a thin highlight band moving across, masked to text.
        'inline-block animate-shimmer bg-clip-text bg-no-repeat',
        '[background-position:0_0] [background-size:var(--shiny-width)_100%]',
        'bg-linear-to-r from-transparent via-current/80 via-50% to-transparent',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
};
