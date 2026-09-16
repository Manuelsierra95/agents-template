"use client";

import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { cn } from "@workspace/ui/lib/utils.ts";
import { spring } from "@workspace/ui/lib/springs.ts";
import type { ItemRect } from "@workspace/ui/hooks/use-fluid-hover.ts";

// ---------------------------------------------------------------------------
// The one hover highlight every fluid hover list renders: an absolutely
// positioned fill that springs between the rects `useFluidHover` measures.
// Consumers used to hand-roll this motion.div; this is that block, once.
//
//   const { activeIndex, itemRects, isMeasured, sessionRef } = useFluidHover(ref);
//   const rect = isMeasured && activeIndex !== null ? itemRects[activeIndex] : null;
//   <FluidHoverHighlight rect={rect} session={sessionRef.current} className={shape.bg} />
//
// It owns no layout opinion beyond `absolute`: radius, z-index, and the
// offsetParent (the container must be `relative`) are the consumer's.
// ---------------------------------------------------------------------------

export interface FluidHoverHighlightProps {
  /** The rect to sit on, in the container's coordinate space. `null` hides
   *  the highlight (it fades out on `spring.fast.exit`). */
  rect: ItemRect | null;
  /** `sessionRef.current` from `useFluidHover`. It increments when the
   *  cursor enters the container, which re-keys the highlight so it fades in
   *  at `from ?? rect` instead of sliding over from wherever it was last. */
  session: number;
  /** Where a fresh session fades in from. A dropdown passes its checked row,
   *  a nav menu its active route. Defaults to `rect`. */
  from?: ItemRect | null;
  /** Radius, z-index, anything else. Merged onto
   *  `absolute bg-hover pointer-events-none`. */
  className?: string;
  /** The positional spring. Defaults to `spring.fast`. Pass `false` to snap
   *  to the new rect with no travel (a layout reflow that moved the rows
   *  underneath, not a hover change). The opacity fade is always 0.08s. */
  transition?: Transition | false;
}

const fade: Transition = { duration: 0.08 };
const snap: Transition = { duration: 0 };

/**
 * Resolves the positional transition. Reduced motion keeps the opacity fade
 * and drops the travel, per the motion guidelines: fewer and gentler, not
 * none. Exported for the unit test.
 */
export function resolveHighlightTransition(
  transition: Transition | false | undefined,
  reduceMotion: boolean
): Transition {
  const positional =
    transition === false || reduceMotion ? snap : (transition ?? spring.fast);
  return { ...positional, opacity: fade };
}

export function FluidHoverHighlight({
  rect,
  session,
  from,
  className,
  transition,
}: FluidHoverHighlightProps) {
  // Reads the OS media query directly, so an installed copy honours reduced
  // motion without the app wrapping its tree in MotionConfig. (MotionConfig
  // alone would not help here: it reduces transforms, and this animates
  // top / left / width / height so the rect stays in layout coordinates.)
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <AnimatePresence>
      {rect && (
        <motion.div
          key={session}
          data-slot="fluid-hover-highlight"
          className={cn("pointer-events-none absolute bg-hover", className)}
          initial={{ opacity: 0, ...(from ?? rect) }}
          animate={{ opacity: 1, ...rect }}
          exit={{ opacity: 0, transition: spring.fast.exit }}
          transition={resolveHighlightTransition(transition, reduceMotion)}
        />
      )}
    </AnimatePresence>
  );
}
