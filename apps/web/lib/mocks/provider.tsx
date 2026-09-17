"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  Availability,
  Booking,
  CalendarEvent,
  CalendarListItem,
  Connection,
  Notification,
  UserPreferences,
  UserProfile,
} from "./types";
import {
  SEED_AVAILABILITY,
  SEED_BOOKINGS,
  SEED_CALENDARS,
  SEED_CONNECTIONS,
  SEED_EVENTS,
  SEED_NOTIFICATIONS,
  SEED_PREFERENCES,
  SEED_USER,
} from "./seed";

/**
 * In-memory mocks store. Hooks underneath read and mutate here; the Provider
 * owns the state so React batches updates and consumers re-render on writes.
 *
 * The shape mirrors the slice each Convex domain would have exposed:
 *   user, preferences, calendars, connections, events, bookings,
 *   availability, notifications.
 */
type State = {
  user: UserProfile;
  preferences: UserPreferences;
  selectedCalendarIds: Set<string>;
  connections: Connection[];
  calendars: CalendarListItem[];
  events: CalendarEvent[];
  bookings: Booking[];
  availability: Availability[];
  notifications: Notification[];
};

const initialState: State = {
  user: SEED_USER,
  preferences: SEED_PREFERENCES,
  selectedCalendarIds: new Set(SEED_CALENDARS.map((c) => c._id)),
  connections: SEED_CONNECTIONS,
  calendars: SEED_CALENDARS,
  events: SEED_EVENTS,
  bookings: SEED_BOOKINGS,
  availability: SEED_AVAILABILITY,
  notifications: SEED_NOTIFICATIONS,
};

type StateSetter = (prev: State) => State;

type MocksContextValue = {
  state: State;
  setState: (setter: StateSetter) => void;
  // Helper "actions" — exposed for ergonomic writes from hooks below.
  setPreferences: (patch: Partial<UserPreferences>) => void;
  setCalendarSelected: (calendarId: string, selected: boolean) => void;
  upsertEvent: (event: CalendarEvent) => void;
  deleteEvent: (id: string) => void;
  moveEvent: (id: string, startMs: number, endMs: number) => void;
  setAvailability: (dayKey: string, intervals: Availability["intervals"]) => void;
  setNotificationRead: (id: string, read: boolean) => void;
  decideBooking: (id: string, status: "confirmed" | "declined") => void;
};

const MocksContext = createContext<MocksContextValue | null>(null);

export function MocksProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<State>(initialState);

  const setState = useCallback((setter: StateSetter) => {
    setStateRaw((prev) => setter(prev));
  }, []);

  const setPreferences = useCallback((patch: Partial<UserPreferences>) => {
    setState((prev) => ({ ...prev, preferences: { ...prev.preferences, ...patch } }));
  }, []);

  const setCalendarSelected = useCallback(
    (calendarId: string, selected: boolean) => {
      setState((prev) => {
        const next = new Set(prev.selectedCalendarIds);
        if (selected) next.add(calendarId);
        else next.delete(calendarId);
        return { ...prev, selectedCalendarIds: next };
      });
    },
    [],
  );

  const upsertEvent = useCallback((event: CalendarEvent) => {
    setState((prev) => {
      const idx = prev.events.findIndex((e) => e._id === event._id);
      if (idx === -1) return { ...prev, events: [...prev.events, event] };
      const next = prev.events.slice();
      next[idx] = event;
      return { ...prev, events: next };
    });
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      events: prev.events.filter((e) => e._id !== id),
    }));
  }, []);

  const moveEvent = useCallback((id: string, startMs: number, endMs: number) => {
    setState((prev) => ({
      ...prev,
      events: prev.events.map((e) =>
        e._id === id ? { ...e, startMs, endMs } : e,
      ),
    }));
  }, []);

  const setAvailability = useCallback(
    (dayKey: string, intervals: Availability["intervals"]) => {
      setState((prev) => {
        const idx = prev.availability.findIndex((a) => a.dayKey === dayKey);
        if (idx === -1)
          return {
            ...prev,
            availability: [...prev.availability, { dayKey, intervals }],
          };
        const next = prev.availability.slice();
        next[idx] = { dayKey, intervals };
        return { ...prev, availability: next };
      });
    },
    [],
  );

  const setNotificationRead = useCallback((id: string, read: boolean) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n._id === id ? { ...n, read } : n,
      ),
    }));
  }, []);

  const decideBooking = useCallback(
    (id: string, status: "confirmed" | "declined") => {
      setState((prev) => {
        const bookings = prev.bookings.map((b) =>
          b._id === id ? { ...b, status } : b,
        );
        const events =
          status === "confirmed"
            ? prev.events.map((e) => {
                const b = prev.bookings.find((bk) => bk._id === id);
                if (!b) return e;
                return e;
              })
            : prev.events;
        // When confirming, also seed a calendar event from the booking.
        const booking = prev.bookings.find((b) => b._id === id);
        if (status === "confirmed" && booking) {
          const newEvent: CalendarEvent = {
            _id: `evt_from_${booking._id}`,
            localCalendarId: "cal_personal_primary",
            summary: `Meeting with ${booking.requesterName}`,
            startMs: booking.startMs,
            endMs: booking.endMs,
            color: "6",
            attendees: [
              {
                email: booking.requesterEmail,
                displayName: booking.requesterName,
              },
            ],
          };
          return {
            ...prev,
            bookings,
            events: [...prev.events, newEvent],
          };
        }
        return { ...prev, bookings };
      });
    },
    [],
  );

  const value = useMemo<MocksContextValue>(
    () => ({
      state,
      setState,
      setPreferences,
      setCalendarSelected,
      upsertEvent,
      deleteEvent,
      moveEvent,
      setAvailability,
      setNotificationRead,
      decideBooking,
    }),
    [
      state,
      setState,
      setPreferences,
      setCalendarSelected,
      upsertEvent,
      deleteEvent,
      moveEvent,
      setAvailability,
      setNotificationRead,
      decideBooking,
    ],
  );

  return <MocksContext value={value}>{children}</MocksContext>;
}

export function useMocks(): MocksContextValue {
  const ctx = useContext(MocksContext);
  if (!ctx) {
    throw new Error("useMocks must be used within a MocksProvider");
  }
  return ctx;
}
