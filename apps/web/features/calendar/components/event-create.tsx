import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { usePreferences } from "@/components/workspace/preferences-context";
import {
  useCreateEvent,
  useListCalendars,
} from "@/lib/mocks";
import type { CalendarListItem } from "@/lib/mocks/types";

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
  canInvite: true,
  canSeeGuests: true,
  canSeeConference: true,
  canInviteOthers: true,
  canChangeRecurrence: true,
};

/** Fields a duplicate carries over from the event it was copied from. The times
 * are not among them — those ride on the dock's create view, so the ghost on
 * the grid keeps following them. */
export type EventPrefill = Partial<
  Omit<EventFormValue, "startMs" | "endMs" | "recurrence">
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
  // Idempotency key for this create intent: minted once and reused across retries
  // (a lost response / re-submit) so the backend dedupes to one Google event
  // instead of creating a duplicate. Cleared only on success.
  const operationIdRef = useRef<string | null>(null);
  // Everything but the range. All three "inherit" defaults mean the same thing:
  // no colour override, the primary calendar (resolved server-side when unset),
  // and the calendar's own visibility.
  const [draft, setDraft] = useState<Omit<EventFormValue, "startMs" | "endMs">>({
    summary: "",
    description: "",
    location: "",
    meet: false,
    allDay: false,
    isPrivate: false,
    // Busy is the provider default, so the toggle starts there.
    busy: true,
    color: undefined,
    calendarId: undefined,
    guests: [],
    recurrence: null,
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
    if (!operationIdRef.current) {
      operationIdRef.current = crypto.randomUUID();
    }
    void createEvent({
      _id: undefined,
      localCalendarId: activeCalendarId ?? "cal_personal_primary",
      summary: value.summary.trim() || "New event",
      startMs: times.startMs,
      endMs: times.endMs,
      allDay: value.allDay,
      description: value.description || undefined,
      location: value.meet ? undefined : value.location.trim() || undefined,
      conferenceUrl: value.meet ? `https://meet.google.com/mock-${operationIdRef.current}` : undefined,
      color: value.color,
      capabilities: FULL_CAPABILITIES,
      attendees:
        value.guests.length > 0
          ? value.guests.map((g) => ({
              email: g.email,
              displayName: g.displayName,
            }))
          : [],
      repeat: value.recurrence
        ? {
            freq: value.recurrence.freq,
            interval: value.recurrence.interval,
            until:
              value.recurrence.end.kind === "onDate"
                ? value.recurrence.end.dateMs
                : undefined,
            count:
              value.recurrence.end.kind === "count"
                ? value.recurrence.end.count
                : undefined,
            byWeekday: value.recurrence.byWeekday
              ? (value.recurrence.byWeekday
                  .map((w) => WEEKDAY_TO_NUM[w])
                  .filter((n): n is number => n !== undefined))
              : undefined,
            byMonthDay: undefined,
          }
        : undefined,
    })
      .then(() => {
        operationIdRef.current = null;
        onCreated();
      })
      .catch((error: unknown) => {
        setSubmitting(false);
        toast.error("Couldn't create event", {
          description: error instanceof Error ? error.message : undefined,
        });
      });
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

/** RRULE weekday token → JS day-of-week (0 = Sunday). */
const WEEKDAY_TO_NUM: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};
