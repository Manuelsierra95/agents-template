"use client";

import { useCallback } from "react";

import type { CalendarEvent } from "@/lib/mocks/types";
import { useMyUser } from "@/lib/mocks/use-preferences";
import { useMocks } from "@/lib/mocks";

/**
 * Capability gating for an event the user is interacting with.
 *
 * In the demo there is no real backend; every event sits on one of the user's
 * calendars, so the user is the implicit owner. Any event on a calendar that
 * the user marks as "selected" (or any of their calendars if no selection
 * tracking yet exists) is editable. Read-only events are kept as a future
 * extension point — guests only on someone else's calendar, for example.
 */
export function useEventCapabilities() {
  const user = useMyUser();
  const { state } = useMocks();
  return useCallback(
    (event: CalendarEvent) => {
      const ownerCalendar = state.calendars.find(
        (c) => c._id === event.localCalendarId,
      );
      const isMine =
        !!ownerCalendar &&
        (state.selectedCalendarIds.has(ownerCalendar._id) ||
          ownerCalendar.primary ||
          event.attendees?.some(
            (a) =>
              a.email.toLowerCase() === user.email &&
              (a.organizer || a.self),
          ));
      return {
        canEdit: event.status !== "cancelled" && (isMine ?? true),
        canDelete: isMine ?? true,
        canInvite: isMine ?? true,
        canSeeGuests: true,
        canSeeConference: true,
      };
    },
    [user.email, state.calendars, state.selectedCalendarIds],
  );
}
