"use client";

import {
  ArrowLeft01Icon,
  Cancel01Icon,
  Clock01Icon,
  Copy01Icon,
  Location01Icon,
  PencilEdit02Icon,
  TextAlignLeft01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { Tooltip } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { format, formatDistanceToNowStrict, isSameDay } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { usePreferences } from "@/components/workspace/preferences-context";
import {
  useDeleteEvent,
  useUpdateEvent,
} from "@/features/calendar/hooks/use-calendar-events";
import type { CalendarEvent } from "@/lib/calendar/types";

import { useEventColor } from "./colors";
import { buttonClass } from "./event-controls";
import type { EventPrefill } from "./event-create";
import {
  calendarDisplayName,
  eventTimeParts,
  fromUtcMidnight,
  MS_PER_DAY,
} from "./lib";
import { dockVariants, dockVariantsReduced, SPRING_DOCK } from "./motion";
import { useEventCapabilities } from "./permissions";

/** How long the delete button waits for its second click before reverting. */
const CONFIRM_TIMEOUT_MS = 3000;

function timeText(
  event: CalendarEvent,
  use24h: boolean,
  timeZone: string,
): string {
  const parts = eventTimeParts(event, use24h, timeZone);
  if (parts.allDay) {
    const { start, lastDay } = parts;
    return isSameDay(start, lastDay)
      ? format(start, "EEE d MMM")
      : `${format(start, "EEE d MMM")} – ${format(lastDay, "EEE d MMM")}`;
  }
  return `${format(parts.start, `EEE d MMM, ${parts.time}`)} – ${parts.endText}`;
}

function DetailRow({
  icon,
  children,
}: {
  icon: IconSvgElement;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm text-muted-foreground">
      <HugeiconsIcon
        icon={icon}
        strokeWidth={2}
        className="mt-0.5 size-4.5 shrink-0"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A tooltipped icon button, matching the colour/calendar controls in the form
 * so the two panels' footers read as one row of the same thing. */
function IconAction({
  icon,
  label,
  onClick,
}: {
  icon: IconSvgElement;
  label: string;
  onClick?: () => void;
}) {
  const content = <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4.5" />;
  return (
    <Tooltip content={label} side="top">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={buttonClass}
      >
        {content}
      </button>
    </Tooltip>
  );
}

/** Two-step delete. There is no dialog primitive here and the dock has no modal
 * layer, so the button confirms on itself: the first click arms it, and it
 * disarms on its own if the second never comes. */
function DeleteButton({
  label,
  destructive,
  onConfirm,
}: {
  label: string;
  destructive: boolean;
  /** Resolves when the delete lands; rejects so the button can re-arm. */
  onConfirm: () => Promise<unknown>;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      type="button"
      size="compact"
      variant="ghost"
      className={
        armed && destructive
          ? "text-destructive hover:text-destructive bg-destructive/10 hover:bg-destructive/20"
          : undefined
      }
      disabled={busy}
      aria-busy={busy}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setBusy(true);
        onConfirm().catch(() => {
          setBusy(false);
          setArmed(false);
        });
      }}
    >
      {busy && <Spinner />}
      {busy
        ? destructive
          ? "Deleting…"
          : "Removing…"
        : armed
          ? "Confirm?"
          : label}
    </Button>
  );
}

export function EventDetail({
  event: snapshot,
  onClose,
  onEdit,
  onDuplicate,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: (prefill: EventPrefill, startMs: number, endMs: number) => void;
}) {
  const reduce = useReducedMotion();
  const { use24h, timeZone } = usePreferences();
  const deleteEvent = useDeleteEvent();
  const updateEvent = useUpdateEvent();
  // The dock hands us the row as it was when the event was opened. We keep
  // the snapshot as the source of truth (no live query in the mock backend).
  const event = snapshot;

  const colorVar = useEventColor()(event);
  const capabilities = useEventCapabilities()(event);

  const [screen, setScreen] = useState<"main" | "description">("main");
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainHeight, setMainHeight] = useState<number>();

  const remove = () => {
    return deleteEvent
      .mutateAsync({ id: event.id })
      .then(onClose)
      .catch((error: unknown) => {
        toast.error("Couldn't remove event", {
          description: error instanceof Error ? error.message : undefined,
        });
      });
  };

  const duplicate = () => {
    onDuplicate(
      {
        summary: event.summary ?? "",
        description: event.description ?? "",
        location: event.location ?? "",
        allDay: event.allDay ?? false,
        isPrivate: false,
        busy: true,
        color: event.color ?? undefined,
      },
      // The form works in working values; undo the all-day UTC-midnight
      // conversion (as formValueFromEvent does) or submit re-applies it and
      // the copy shifts or grows by a day.
      event.allDay ? fromUtcMidnight(event.startMs, timeZone) : event.startMs,
      event.allDay
        ? fromUtcMidnight(event.endMs - MS_PER_DAY, timeZone)
        : event.endMs,
    );
  };

  const copySummary = () => {
    const text = `${event.summary ?? "Event"}\t${format(event.startMs, "EEE d MMM")}`;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Couldn't copy"));
  };

  const variants = reduce ? dockVariantsReduced : dockVariants;

  return (
    <AnimatePresence
      mode="popLayout"
      initial={false}
      custom={screen === "description" ? 1 : -1}
    >
      {screen === "description" ? (
        <motion.div
          key="description"
          custom={1}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ height: mainHeight }}
          className="flex flex-col gap-3"
        >
          <button
            type="button"
            onClick={() => setScreen("main")}
            className="-ml-1 flex items-center gap-1 self-start rounded-lg px-1 py-0.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              strokeWidth={2}
              className="size-4 text-muted-foreground"
            />
            {event.summary ?? "(No title)"}
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto text-sm">
            {event.description ? (
              <p className="whitespace-pre-wrap">{event.description}</p>
            ) : (
              <p className="text-muted-foreground">No description</p>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="main"
          ref={mainRef}
          custom={-1}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex flex-col gap-3"
        >
          <div className="flex items-start gap-3">
            {/* A color strip on the left, matching the event cards on the grid
                (event-card.tsx) rather than a lone dot. */}
            <span
              aria-hidden
              className="w-[3px] shrink-0 self-stretch rounded-full"
              style={{ backgroundColor: `var(${colorVar})` }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="line-clamp-2 text-base font-semibold leading-tight">
                {event.summary ?? "(No title)"}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Busy</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-0.5 -mr-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
            </button>
          </div>

          <DetailRow icon={Clock01Icon}>
            <p className="text-sm font-medium text-foreground">
              {timeText(event, use24h, timeZone)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNowStrict(event.startMs, { addSuffix: true })}
            </p>
          </DetailRow>

          {event.location && (
            <DetailRow icon={Location01Icon}>
              <a
                href={
                  /^https?:\/\//i.test(event.location)
                    ? event.location
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
                }
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {event.location}
              </a>
            </DetailRow>
          )}

          {event.description && (
            <DetailRow icon={TextAlignLeft01Icon}>
              <button
                type="button"
                onClick={() => {
                  setMainHeight(mainRef.current?.offsetHeight);
                  setScreen("description");
                }}
                className="-mx-1 line-clamp-4 rounded px-1 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {event.description}
              </button>
            </DetailRow>
          )}

          <div className="flex items-center justify-between gap-2 -mb-2">
            <div className="flex items-center gap-1 border-2 rounded-xl -ml-2">
              <IconAction icon={Copy01Icon} label="Duplicate" onClick={duplicate} />
              <IconAction icon={Copy01Icon} label="Copy summary" onClick={copySummary} />
            </div>

            <div className="flex items-center gap-2 -mr-2">
              {capabilities.canDelete && (
                <DeleteButton
                  label="Delete"
                  destructive={capabilities.canDelete}
                  onConfirm={() => remove()}
                />
              )}
              {capabilities.canEdit && (
                <Button type="button" size="compact" onClick={onEdit}>
                  <HugeiconsIcon
                    icon={PencilEdit02Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Keep `updateEvent` referenced so tree-shakers don't drop the import; the
// `event-detail` panel may soon host an RSVP control again when guest data
// is reintroduced.
void useUpdateEvent;
