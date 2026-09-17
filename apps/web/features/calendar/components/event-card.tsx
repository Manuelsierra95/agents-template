import { Video01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@workspace/ui/lib/utils";
import { format } from "date-fns";
import { motion } from "motion/react";

import { usePreferences } from "@/components/workspace/preferences-context";

import { Avatar } from "./avatar";
import { useEventColor } from "./colors";
import {
  EVENT_LEFT_GUTTER_PX,
  laneBox,
  type PositionedEvent,
  stackIndentPx,
  timePattern,
  zoned,
} from "./lib";
import { useEventCapabilities } from "./permissions";
import { RevealFlash, type Reveal } from "./today-pulse";
import type { DragMode } from "./use-event-drag";

interface EventCardProps {
  positioned: PositionedEvent;
  /** True while this card is the one being moved/resized. */
  isDragging: boolean;
  /** Lay overlaps out as side-by-side columns (day view) instead of the cascade
   * (week view), where the column is too narrow to subdivide. */
  laneLayout: boolean;
  /** Synced contact photos keyed by lower-cased email. */
  contactPhotos: ReadonlyMap<string, string>;
  /** The active reveal target; pulses this card when it's the one reached for. */
  reveal: Reveal;
  /** Begin a gesture; the mode is derived from where the press landed. */
  onDragStart: (mode: DragMode, e: React.PointerEvent) => void;
}

/** Pick the gesture from the press target: the edge handles resize, the body
 * moves the whole event. */
function modeForTarget(target: EventTarget | null): DragMode {
  const el = target as HTMLElement | null;
  if (el?.closest("[data-resize-top]")) return "resize-start";
  if (el?.closest("[data-resize-bottom]")) return "resize-end";
  return "move";
}

export function EventCard({
  positioned,
  isDragging,
  laneLayout,
  contactPhotos,
  reveal,
  onDragStart,
}: EventCardProps) {
  const {
    event,
    topPct,
    heightPct,
    stackIndex,
    columnIndex,
    columnCount,
    columnSpan,
  } = positioned;
  const colorFor = useEventColor();
  const colorVar = colorFor(event);
  const { use24h, timeZone } = usePreferences();
  // An event the user can't reschedule still opens on tap, but it shouldn't
  // offer a grab cursor or resize edges for a drag that will never happen.
  const { canEdit: draggable, canSeeGuests } = useEventCapabilities()(event);
  const attendees = canSeeGuests ? (event.attendees ?? []).slice(0, 3) : [];
  // The dragged event must never sit *on top* of a longer neighbour covering
  // its title. In both Day and Week view, two overlapping cards get a strict
  // tile (advance = 1) so they sit cleanly side-by-side with no horizontal
  // overlap. The cascade indent (peek-out from the right) was creating the
  // "smaller on top of larger" bug, and putting the larger in front hid the
  // smaller entirely — neither is what we want.
  const tiled = true;
  const useLanes = laneLayout || tiled;
  const indent = stackIndentPx(stackIndex);
  const effectiveAdvance = 1;
  const box = laneBox(columnIndex, columnCount, columnSpan, effectiveAdvance);
  // A fixed strip is reserved on the left of the column (see EVENT_LEFT_GUTTER_PX):
  // the fractional lane box is squeezed into the space right of it, so cards still
  // fan out and end flush on the right while the left edge stays free for painting
  // a neighbouring event. `gutter` is that reserved width; `avail` is what's left.
  const gutter = `${EVENT_LEFT_GUTTER_PX}px`;
  const avail = `(100% - ${gutter})`;
  const horizontal = useLanes
    ? {
        left: `calc(${gutter} + ${box.left} * ${avail} + 2px)`,
        width: `calc(${box.width} * ${avail} - 4px)`,
      }
    : {
        left: `calc(${gutter} + ${indent}px + 2px)`,
        width: `calc(${avail} - ${indent}px - 4px)`,
      };
  // The card is a size-query container (see `.event-card` in globals.css): the
  // start time and title shrink out as the rendered height gets small, so short
  // events stay legible instead of clipping the title. This tracks actual
  // pixels, so a short event regains its detail lines when the grid is zoomed.
  return (
    <motion.div
      data-event
      onPointerDown={(e) => onDragStart(modeForTarget(e.target), e)}
      // No `whileTap` — motion's tap interaction latches while the pointer
      // capture holds during a drag, so the card stays at `scale(0.97)` after
      // release and looks visually shrunk even though the actual width is
      // unchanged. The ring on the dragging card already gives the same
      // feedback without leaving residual state.
      className={cn(
        // A 15-minute event is only ~15px tall at the grid's 60px-an-hour
        // floor — still not enough for the title at default 14px font. The
        // `min-h-[20px]` floor pads short events to a height that holds the
        // 12px-font title cleanly. The grid's 60px/h density (vs. calendar-v1's
        // 40px/h) is what makes this safe with back-to-back siblings: a 15-min
        // card ends at ~9:18 in a 9:00–9:15 slot, so only ~5px of overlap with
        // the next event — about half of what the original 40px/h floor had.
        "event-card group absolute min-h-[20px] overflow-hidden rounded-lg shadow-sm ring-1 ring-border/60 inset-ring inset-ring-black/10 select-none dark:inset-ring-white/10",
        draggable ? "cursor-grab" : "cursor-pointer",
        isDragging &&
          "cursor-grabbing touch-none shadow-lg ring-2 ring-primary/60",
      )}
      style={{
        top: `${topPct}%`,
        height: `${heightPct}%`,
        left: horizontal.left,
        width: horizontal.width,
        // Z-order: in cascade the *earlier* card is the bigger one, so we
        // give it the higher z so the smaller dragged event sits *behind*
        // instead of on top of the larger neighbour. Tiled/fanned events in
        // Day view don't overlap horizontally, so the order is moot there.
        zIndex: isDragging
          ? 50
          : 10 + (positioned.stackCount - 1 - positioned.stackIndex),
        backgroundColor: `color-mix(in oklab, var(${colorVar}) 22%, var(--card))`,
      }}
    >
      <RevealFlash
        reveal={reveal}
        targetId={[event._id, event.providerEventId]}
        className="rounded-lg bg-[color-mix(in_oklab,var(--primary)_45%,transparent)]"
      />
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[3px] rounded-full"
        style={{ backgroundColor: `var(${colorVar})` }}
      />
      <div className="event-card-body flex h-full flex-col justify-start py-1 pr-2 pl-3">
        {/* No `text-*`/`leading-*` utilities on these two: the size steps live in
            `.event-card-title` / `.event-card-time` (globals.css), and a utility
            here sits in a later layer and would silently outrank them. */}
        <p className="event-card-title font-medium">
          {event.summary ?? "(No title)"}
        </p>
        <p className="event-card-time truncate text-muted-foreground">
          {`${format(zoned(event.startMs, timeZone), timePattern(use24h, false))} – ${format(zoned(event.endMs, timeZone), timePattern(use24h))}`}
        </p>
        {(attendees.length > 0 || event.conferenceUrl) && (
          <div className="event-card-meta mt-auto min-w-0 items-center justify-between gap-1 pt-1">
            {attendees.length > 0 && (
              <span className="event-card-attendees flex min-w-0 items-center">
                {attendees.map((attendee) => (
                  <span
                    key={attendee.email}
                    className="event-card-attendee relative -ml-1.5 shrink-0 rounded-full ring-1 ring-background/80 first:ml-0"
                  >
                    <Avatar
                      email={attendee.email}
                      name={attendee.displayName}
                      photoUrl={contactPhotos.get(attendee.email.toLowerCase())}
                      className="size-5 text-[0.625rem]"
                    />
                  </span>
                ))}
              </span>
            )}
            {event.conferenceUrl && (
              <span
                role="img"
                aria-label="Video call attached"
                className="event-card-meeting ml-auto shrink-0 text-muted-foreground/45"
              >
                <HugeiconsIcon icon={Video01Icon} size={15} strokeWidth={1.8} />
              </span>
            )}
          </div>
        )}
      </div>
      {/* Edge handles for resizing start/end. Invisible until hover so they
          don't clutter the card, but always hit-testable. */}
      {draggable && (
        <>
          <span
            data-resize-top
            aria-hidden
            className="absolute inset-x-0 top-0 h-2 cursor-ns-resize touch-none"
          />
          <span
            data-resize-bottom
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none"
          />
        </>
      )}
    </motion.div>
  );
}
