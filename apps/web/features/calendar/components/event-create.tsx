"use client";

import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

import { usePreferences } from "@/components/workspace/preferences-context";
import { useCreateEvent } from "@/features/calendar/hooks/use-calendar-events";
import { useListCalendars } from "@/lib/mocks/use-calendars";
import type { CalendarListItem } from "@/lib/calendar/types";

import {
  EventForm,
  isEventFormValid,
  toEventTimes,
  type EventFormValue,
  type FormCapabilities,
} from "./event-form";
import { isWritableCalendar, pickPrimaryCalendar } from "./lib";

/** A new event has no owner to answer to yet, so every control is live. */
const FULL_CAPABILITIES: FormCapabilities = {
  canEdit: true,
  canDelete: true,
};

/** Fields a duplicate carries over from the event it was copied from. The times
 * are not among them — those ride on the dock's create view, so the ghost on
 * the grid keeps following them. */
export type EventPrefill = Partial<
  Omit<EventFormValue, "startMs" | "endMs">
>;

export function EventCreate({
  startMs,
  endMs,
  prefill,
  onChangeRange,
  onCancel,
  onCreated,
}: {
  startMs: number;
  endMs: number;
  prefill?: EventPrefill;
  /** Lifts edited times back to the dock so the ghost on the grid follows along. */
  onChangeRange: (startMs: number, endMs: number) => void;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const createEvent = useCreateEvent();
  const calendars = useListCalendars();
  const { raw: preferences, timeZone } = usePreferences();
  const defaultCalendarId = preferences.defaultCalendarId;
  const [submitting, setSubmitting] = useState(false);
  // Everything but the range. Two "inherit" defaults mean the same thing:
  // no colour override, the primary calendar (resolved server-side when unset),
  // and the calendar's own visibility.
  const [draft, setDraft] = useState<Omit<EventFormValue, "startMs" | "endMs">>({
    summary: "",
    description: "",
    location: "",
    allDay: false,
    isPrivate: false,
    busy: true,
    color: undefined,
    calendarId: undefined,
    ...prefill,
  });

  // Until the user picks one, the event goes to their default calendar (the
  // settings preference), falling back to primary — resolved here too so the
  // controls can preview its colour. A stale preference (calendar removed, or
  // since downgraded to read-only or shared) falls through to primary rather
  // than erroring server-side on every quick-create.
  const activeCalendarId =
    draft.calendarId ??
    calendars.find(
      (c) => c._id === defaultCalendarId && isWritableCalendar(c),
    )?._id ??
    pickPrimaryCalendar(calendars)?._id;
  const value: EventFormValue = {
    ...draft,
    calendarId: activeCalendarId,
    startMs,
    endMs,
  };
  const valid = isEventFormValid(value);

  const onChange = (patch: Partial<EventFormValue>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    const times = toEventTimes(value, timeZone);
    createEvent.mutate(
      {
        summary: value.summary.trim() || "New event",
        startMs: times.startMs,
        endMs: times.endMs,
        allDay: value.allDay,
        ...(value.description ? { description: value.description } : {}),
        ...(value.location.trim() ? { location: value.location.trim() } : {}),
        ...(value.color ? { color: value.color } : {}),
      },
      {
        onSuccess: () => {
          setSubmitting(false);
          onCreated();
        },
        onError: (error) => {
          setSubmitting(false);
          toast.error("Couldn't create event", {
            description: error instanceof Error ? error.message : undefined,
          });
        },
      },
    );
  };

  return (
    <EventForm
      value={value}
      onChange={onChange}
      onChangeRange={onChangeRange}
      onSubmit={submit}
      capabilities={FULL_CAPABILITIES}
      calendars={calendars as CalendarListItem[]}
      canChangeCalendar
      autoFocusTitle
      footer={
        <>
          <Button type="button" variant="ghost" size="compact" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="compact" disabled={!valid || submitting}>
            {submitting && <Spinner />}
            {submitting ? "Creating…" : "Create"}
          </Button>
        </>
      }
    />
  );
}
