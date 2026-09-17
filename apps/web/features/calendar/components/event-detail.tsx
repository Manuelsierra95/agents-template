import {
  ArrowLeft01Icon,
  Cancel01Icon,
  Clock01Icon,
  Copy01Icon,
  Location01Icon,
  PencilEdit02Icon,
  RepeatIcon,
  TextAlignLeft01Icon,
  UserMultiple02Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { GooDropdown } from "@workspace/ui/components/ui/goo-dropdown";
import { Tooltip } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { format, formatDistanceToNowStrict, isSameDay } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { usePreferences } from "@/components/workspace/preferences-context";
import {
  useDeleteEvent,
  useListCalendars,
  useUpdateEvent,
} from "@/lib/mocks";
import type { CalendarEvent } from "@/lib/mocks/types";

import { Avatar } from "./avatar";
import { calendarColorVar, useEventColor } from "./colors";
import { buttonClass } from "./event-controls";
import type { EventPrefill } from "./event-create";
import { GoogleMeetIcon } from "./google-meet-icon";
import {
  GuestRow,
  groupGuests,
  rsvpColorVar,
  rsvpSummary,
  type Guest,
} from "./guest-picker";
import {
  calendarDisplayName,
  eventTimeParts,
  fromUtcMidnight,
  MS_PER_DAY,
} from "./lib";
import { dockVariants, dockVariantsReduced, press, SPRING_DOCK } from "./motion";
import { useEventCapabilities } from "./permissions";
import { parseRRule, summarize } from "./rrule";

/** How many avatars to show before collapsing the rest into a "+N" bubble. */
const MAX_AVATARS = 6;

/** How long the delete button waits for its second click before reverting. */
const CONFIRM_TIMEOUT_MS = 3000;

const RSVP_CHOICES = [
  { status: "accepted", label: "Going" },
  { status: "tentative", label: "Maybe" },
  { status: "declined", label: "No" },
] as const;

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
  href,
}: {
  icon: IconSvgElement;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const content = <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4.5" />;
  return (
    <Tooltip content={label} side="top">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          className={buttonClass}
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={buttonClass}
        >
          {content}
        </button>
      )}
    </Tooltip>
  );
}

/** Guests as an overlapping avatar stack that expands into the same rows the
 * guest picker uses. Each avatar carries a dot in its answer's colour, so the
 * shape of the RSVPs is readable without expanding anything. */
function GuestSection({
  guests,
  hidden,
}: {
  guests: Guest[];
  hidden: boolean;
}) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const guestListRef = useRef<HTMLDivElement>(null);
  const [scrollFade, setScrollFade] = useState({ top: false, bottom: false });

  const enriched = useMemo(() => guests, [guests]);

  const updateScrollFade = () => {
    const list = guestListRef.current;
    if (!list) return;
    const next = {
      top: list.scrollTop > 0,
      bottom: list.scrollTop + list.clientHeight < list.scrollHeight - 1,
    };
    setScrollFade((current) =>
      current.top === next.top && current.bottom === next.bottom ? current : next,
    );
  };

  useEffect(() => {
    const list = guestListRef.current;
    if (!expanded || !list) return;
    updateScrollFade();
    const observer = new ResizeObserver(updateScrollFade);
    observer.observe(list);
    return () => observer.disconnect();
  }, [expanded, enriched]);

  if (hidden) {
    return (
      <DetailRow icon={UserMultiple02Icon}>
        Guest list hidden by the organiser
      </DetailRow>
    );
  }

  const shown = enriched.slice(0, MAX_AVATARS);
  const overflow = enriched.length - shown.length;

  return (
    <DetailRow icon={UserMultiple02Icon}>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="flex flex-col items-start gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center">
            {shown.map((g) => (
              <span
                key={g.email}
                className="relative -ml-1.5 rounded-full ring-2 ring-popover first:ml-0"
              >
                <Avatar
                  email={g.email}
                  name={g.displayName}
                  photoUrl={g.photoUrl}
                  className="size-6"
                />
                <span
                  className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-popover"
                  style={{ backgroundColor: `var(${rsvpColorVar(g)})` }}
                />
              </span>
            ))}
            {overflow > 0 && (
              <span className="-ml-1.5 flex size-6 items-center justify-center rounded-full bg-muted text-[0.625rem] font-semibold text-muted-foreground ring-2 ring-popover">
                +{overflow}
              </span>
            )}
          </span>
          <span className="text-xs">{rsvpSummary(enriched)}</span>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="guests"
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={SPRING_DOCK}
              className="overflow-hidden"
            >
              <div className="relative">
                <div
                  ref={guestListRef}
                  onScroll={updateScrollFade}
                  className="flex max-h-56 flex-col gap-3 scrollbar-gutter-stable overflow-y-auto pt-1"
                >
                  {groupGuests(enriched).map((group) => (
                    <div key={group.label} className="flex flex-col gap-0.5">
                      <p className="px-1 text-xs font-medium">
                        {group.guests.length} {group.label}
                      </p>
                      {group.guests.map((g) => (
                        <GuestRow key={g.email} guest={g} />
                      ))}
                    </div>
                  ))}
                </div>
                {scrollFade.top && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute top-0 right-3 left-0 h-10 bg-linear-to-b from-popover to-transparent"
                  />
                )}
                {scrollFade.bottom && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute right-3 bottom-0 left-0 h-10 bg-linear-to-t from-popover to-transparent"
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DetailRow>
  );
}

/** Answer an invitation. Deliberately the same segmented control as the form's
 * Starts/Ends tabs — when you're a guest this is the panel's primary action. */
function RsvpControl({
  event,
  current,
  onUpdate,
}: {
  event: CalendarEvent;
  current?: string;
  onUpdate: (event: CalendarEvent) => void;
}) {
  const [optimistic, setOptimistic] = useState<string>();
  const active = optimistic ?? current;

  // Once the live row agrees, drop the override — otherwise it would outrank a
  // later answer made elsewhere, and this panel would show a stale one forever.
  useEffect(() => {
    if (optimistic !== undefined && current === optimistic) {
      setOptimistic(undefined);
    }
  }, [current, optimistic]);

  const choose = (status: (typeof RSVP_CHOICES)[number]["status"]) => {
    if (status === active) return;
    setOptimistic(status);
    const updated: CalendarEvent = {
      ...event,
      attendees: (event.attendees ?? []).map((a) =>
        a.self ? { ...a, response: status } : a,
      ),
    };
    onUpdate(updated);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">Are you going?</p>
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {RSVP_CHOICES.map((choice) => (
          <motion.button
            key={choice.status}
            type="button"
            aria-pressed={active === choice.status}
            onClick={() => choose(choice.status)}
            {...press}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === choice.status
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {choice.label}
          </motion.button>
        ))}
      </div>
    </div>
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
        // A refused delete has to leave a usable button behind.
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

type DeleteScope = "thisEvent" | "thisAndFollowing" | "allEvents";

const RECURRING_DELETE_SCOPES: {
  scope: DeleteScope;
  label: string;
  organizerOnly?: boolean;
}[] = [
  { scope: "thisEvent", label: "This event" },
  {
    scope: "thisAndFollowing",
    label: "This and following events",
    organizerOnly: true,
  },
  { scope: "allEvents", label: "All events" },
];

function recurringDeleteScopes(isOrganizer: boolean) {
  return RECURRING_DELETE_SCOPES.filter(
    (option) => !option.organizerOnly || isOrganizer,
  );
}

/** The scope menu itself is the recurring event's destructive confirmation. */
function RecurringDeleteControl({
  label,
  destructive,
  isOrganizer,
  onConfirm,
}: {
  label: string;
  destructive: boolean;
  isOrganizer: boolean;
  onConfirm: (scope: DeleteScope) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const options = recurringDeleteScopes(isOrganizer);
  return (
    <GooDropdown
      trigger={
        <>
          {busy && <Spinner />}
          {busy ? (destructive ? "Deleting…" : "Removing…") : label}
        </>
      }
      disabled={busy}
      side="top"
      align="end"
      gap={8}
      width={224}
      buttonRadius={16}
      activeFill={
        destructive
          ? "color-mix(in oklch, var(--destructive) 10%, var(--popover))"
          : undefined
      }
      activeForeground={destructive ? "var(--destructive)" : undefined}
      activeHoverFill={
        destructive
          ? "color-mix(in oklch, var(--destructive) 20%, var(--popover))"
          : undefined
      }
      menuLabel={`${label} recurring event`}
      items={options.map((option) => ({
        label: option.label,
        onClick: () => {
          setBusy(true);
          void onConfirm(option.scope).catch(() => setBusy(false));
        },
      }))}
    />
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
  const calendars = useListCalendars();
  // The dock hands us the row as it was when the event was opened. We keep
  // the snapshot as the source of truth (no live query in the mock backend).
  const event = snapshot;
  const recurrenceLines = event.repeat
    ? [`RRULE:FREQ=${event.repeat.freq}`]
    : null;

  const colorVar = useEventColor()(event);
  const capabilities = useEventCapabilities()(event);
  const calendar = calendars.find((c) => c._id === event.localCalendarId);

  const [screen, setScreen] = useState<"main" | "description">("main");
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainHeight, setMainHeight] = useState<number>();
  const deleteOperationRef = useRef<{
    scope: DeleteScope;
    operationId: string;
  } | null>(null);

  const recurrence = recurrenceLines
    ? parseRRule(recurrenceLines, timeZone)
    : null;
  const recurrenceSummary = recurrence ? summarize(recurrence, timeZone) : null;

  const guests: Guest[] = (event.attendees ?? []).map((a) => ({
    email: a.email,
    displayName: a.displayName,
    responseStatus: a.response,
    organizer: a.organizer,
  }));

  const remove = (scope: DeleteScope) => {
    if (deleteOperationRef.current?.scope !== scope) {
      deleteOperationRef.current = {
        scope,
        operationId: crypto.randomUUID(),
      };
    }
    return deleteEvent(event._id)
      .then(onClose)
      .catch((error: unknown) => {
        toast.error("Couldn't remove event", {
          description: error instanceof Error ? error.message : undefined,
        });
        throw error;
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
        color: event.color,
        calendarId: calendar?._id,
        // A copy's invitees start unasked — carrying answers across would claim
        // replies to an event that doesn't exist yet.
        guests: guests.map((g) => ({
          email: g.email,
          displayName: g.displayName,
        })),
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

  const copyLink = () => {
    if (!event.conferenceUrl) return;
    navigator.clipboard
      .writeText(event.conferenceUrl)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn't copy the link"));
  };

  const conferenceUrl = event.conferenceUrl;
  const conferenceName = "Google Meet";

  const copyConferenceLink = () => {
    if (!conferenceUrl) return;
    navigator.clipboard
      .writeText(conferenceUrl)
      .then(() => toast.success("Video link copied"))
      .catch(() => toast.error("Couldn't copy the link"));
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
                {calendar && (
                  <>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: `var(${calendarColorVar(calendar)})`,
                      }}
                    />
                    <span className="truncate">
                      {calendarDisplayName(calendar)}
                    </span>
                    <span aria-hidden>·</span>
                  </>
                )}
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

          {event.repeat && (
            <DetailRow icon={RepeatIcon}>
              {recurrenceSummary === undefined ? (
                <Spinner
                  aria-label="Loading recurrence"
                  className="text-muted-foreground"
                />
              ) : (
                recurrenceSummary ?? "Part of a repeating series"
              )}
            </DetailRow>
          )}

          {conferenceUrl && (
            <div className="flex items-center gap-3">
              <GoogleMeetIcon className="mt-0.5 size-4.5 shrink-0 self-start" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {conferenceName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {conferenceUrl.replace(/^https?:\/\//, "")}
                </p>
              </div>
              <IconAction
                icon={Copy01Icon}
                label={`Copy ${conferenceName} link`}
                onClick={copyConferenceLink}
              />
              <Button
                size="compact"
                asChild
                className="bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-500 dark:hover:bg-emerald-500/90"
              >
                <a
                  href={conferenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <HugeiconsIcon
                    icon={Video01Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                  Join
                </a>
              </Button>
            </div>
          )}

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

          {guests.length > 0 && (
            <GuestSection guests={guests} hidden={!capabilities.canSeeGuests} />
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
              {event.conferenceUrl && (
                <IconAction icon={Copy01Icon} label="Copy link" onClick={copyLink} />
              )}
              <IconAction icon={Copy01Icon} label="Duplicate" onClick={duplicate} />
            </div>

            <div className="flex items-center gap-2 -mr-2">
              {capabilities.canDelete && (
                event.repeat ? (
                  <RecurringDeleteControl
                    label="Delete"
                    destructive={capabilities.canDelete}
                    isOrganizer={Boolean(event.attendees?.some((a) => a.organizer))}
                    onConfirm={remove}
                  />
                ) : (
                  <DeleteButton
                    label="Delete"
                    destructive={capabilities.canDelete}
                    onConfirm={() => remove("thisEvent")}
                  />
                )
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
      {/* The RsvpControl is rendered when the current user is an attendee but
         not the organiser; the mock's capabilities shape is coarser than the
         backend's, so we don't surface it here yet. */}
      {false && capabilities.canEdit && (
        <RsvpControl
          event={event}
          current={undefined}
          onUpdate={(next) => void updateEvent(next)}
        />
      )}
    </AnimatePresence>
  );
}
