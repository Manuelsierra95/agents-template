/** Shared types for the calendar UI. Plain TS — no Convex Doc<> wrapper. */

export type CalendarEvent = {
  _id: string;
  /** Local calendar this event belongs to. */
  localCalendarId: string;
  /** Stable provider identifier (Google's event id, if synced). */
  providerEventId?: string;
  /** "events" segment. */
  kind?: "default" | "focus" | "outOfOffice" | "workingLocation";
  summary?: string;
  description?: string;
  location?: string;
  /** Event start, ms since epoch (UTC). */
  startMs: number;
  /** Event end, ms since epoch (UTC). */
  endMs: number;
  allDay?: boolean;
  status?: "confirmed" | "cancelled" | "tentative";
  /** Google Calendar's "1".."11" color key, when known. */
  color?: string;
  attendees?: Attendee[];
  conferenceUrl?: string;
  repeat?: RepeatRule;
  /** Locks interactivity: read-only on remote calendars. */
  capabilities?: EventCapabilities;
};

export type Attendee = {
  email: string;
  displayName?: string;
  /** Optional sync'd contact photo URL. */
  photoUrl?: string;
  organizer?: boolean;
  self?: boolean;
  response?: "needsAction" | "accepted" | "declined" | "tentative";
  optional?: boolean;
};

export type RepeatRule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval?: number;
  until?: number;
  count?: number;
  byWeekday?: number[];
  byMonthDay?: number[];
};

export type EventCapabilities = {
  canEdit: boolean;
  canDelete: boolean;
  canInvite: boolean;
  canSeeGuests: boolean;
  canSeeConference: boolean;
};

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
