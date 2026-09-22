/**
 * Shared types for the mocks that still back the calendar workspace —
 * calendars, bookings, availability, notifications, preferences, search,
 * and the public-page preview.
 *
 * Calendar events (`CalendarEvent`) moved to `@/lib/calendar/types`,
 * derived from the contracts schemas. The remaining mock-only surfaces
 * (`useSearch`, the search panel) use `MockSearchEvent` below — a
 * legacy shape that still carries `_id`, `localCalendarId`, and
 * `attendees`. Search will migrate to the real backend in a later phase
 * and `MockSearchEvent` will be deleted then.
 */
export type { CalendarEvent } from "@/lib/calendar/types"

/**
 * Legacy mock shape for the search-panel seed index. Distinct from the
 * wire `CalendarEvent` (which has `id` / `organizationId` / etc.). Kept
 * around so the search index doesn't need a complete rewrite before the
 * calendar-events migration ships.
 */
export type MockSearchEvent = {
  _id: string
  localCalendarId: string
  summary?: string
  description?: string
  location?: string
  startMs: number
  endMs: number
  allDay?: boolean
  color?: string
  conferenceUrl?: string
  attendees?: MockAttendee[]
}

/** Attendee shape that the search panel still consumes from the seed. */
export type MockAttendee = {
  email: string
  displayName?: string
  photoUrl?: string
  self?: boolean
  organizer?: boolean
  response?: "needsAction" | "accepted" | "declined" | "tentative"
}

/** A calendar the user has access to. */
export type CalendarListItem = {
  _id: string;
  primary: boolean;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  accountId: string;
  /** Google Calendar backgroundColor (#RRGGBB), snapped onto the app palette at
   * render time. */
  backgroundColor?: string;
  /** Optional summary used for display. */
  summary?: string;
};

/** A Google account the user has connected. */
export type Connection = {
  _id: string;
  provider: "google";
  email: string;
  name: string;
  imageUrl?: string;
};

/** A pending booking request landing on the host's calendar. */
export type Booking = {
  _id: string;
  startMs: number;
  endMs: number;
  requesterName: string;
  requesterEmail: string;
  note?: string;
  /** Where in the funnel it sits. */
  status: "pending" | "confirmed" | "declined" | "cancelled";
  createdAt: number;
  slotMinutes: number;
};

/** Day-bucketed availability for editing (in minutes from the day's start). */
export type DayInterval = { startMin: number; endMin: number };

export type Availability = {
  /** Calendar-day key in the user's working zone, e.g. "2026-09-07". */
  dayKey: string;
  intervals: DayInterval[];
};

export type Notification = {
  _id: string;
  kind: "booking_request" | "booking_confirmed" | "booking_declined" | "reminder";
  createdAt: number;
  read: boolean;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
};

export type UserProfile = {
  _id: string;
  email: string;
  displayName: string;
  imageUrl?: string;
  /** The slug a public booking link uses. */
  bookingSlug?: string;
};

export type UserPreferences = {
  /** `6` is the Saturday-start week (some Middle Eastern calendars). The seed
   * defaults to Monday (`1`); the settings UI lets the user pick any of the
   * three. */
  weekStartsOn: 0 | 1 | 6;
  timeFormat: "12h" | "24h";
  defaultView: "day" | "week" | "month";
  timeZone: string;
  defaultCalendarId: string | null;
};

export type PublicBookingPage = {
  displayName: string;
  imageUrl?: string;
  title?: string;
  description?: string;
  slotMinutes: number;
  /** Time-zone IANA the visitor is in, for labelling. */
  visitorZone: string;
};

export type BookingSlot = {
  startMs: number;
  available: boolean;
};
