import {
  addDays,
  addMinutes,
  addWeeks,
  endOfDay,
  endOfWeek,
  formatISO,
  startOfDay,
  startOfWeek,
} from "date-fns";

/**
 * Anchor all relative timestamps in this module. A fixed epoch makes the seed
 * fully deterministic so a Next 16 static prerender doesn't trip on
 * `Date.now()` evaluating outside a Suspense boundary. The calendar derives
 * everything from this anyway.
 */
export const SEED_NOW = new Date("2026-09-07T12:00:00").getTime();

// TODO(user-config): the captured `timeZone` on `SEED_PREFERENCES` below is
// evaluated at module-load time on whichever environment imports this first
// (typically the server during the Next 16 prerender). When the user-config
// endpoint lands, the provider should consume `preferences.timeZone` straight
// from the API response and this capture should be removed entirely. Until
// then, the now-indicator renders against the prerender server's IANA zone,
// which can drift from the user's browser — observed: Madrid 13:00 → line
// between 3pm-4pm (Asia/Kabul/+4:30 frame). See `preferences-context.tsx`
// for the consumer-side fallback.

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

/**
 * Deterministic, week-anchored mocks. Day zero is the start of the current week
 * (Sun/Mon depending on prefs); everything else is positioned relative to it so
 * the calendar populates with realistic spacing no matter when the app loads.
 */

const TODAY = new Date(SEED_NOW);
const WEEK_START = startOfWeek(TODAY, { weekStartsOn: 1 }); // Monday-anchored by default
const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

function at(dayOffset: number, hour: number, minute = 0): number {
  const base = addDays(WEEK_START, dayOffset);
  base.setHours(hour, minute, 0, 0);
  return base.getTime();
}

function isAllDay(dayOffset: number, hour: number): { startMs: number; endMs: number } {
  const day = addDays(WEEK_START, dayOffset);
  const start = new Date(day);
  start.setUTCHours(0, 0, 0, 0);
  return {
    startMs: Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()),
    endMs: Date.UTC(day.getFullYear(), day.getMonth(), day.getDate() + 1),
  };
}

export const SEED_USER: UserProfile = {
  _id: "user_me",
  email: "morgan@qali.test",
  displayName: "Morgan Lee",
  imageUrl: undefined,
  bookingSlug: "demo",
};

export const SEED_PREFERENCES: UserPreferences = {
  weekStartsOn: 1,
  timeFormat: "12h",
  defaultView: "week",
  timeZone:
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC",
  defaultCalendarId: "cal_personal_primary",
};

export const SEED_CONNECTIONS: Connection[] = [
  {
    _id: "conn_personal",
    provider: "google",
    email: "morgan@qali.test",
    name: "Morgan Lee",
  },
  {
    _id: "conn_work",
    provider: "google",
    email: "morgan@qali.test",
    name: "Morgan Lee",
  },
];

export const SEED_CALENDARS: CalendarListItem[] = [
  {
    _id: "cal_personal_primary",
    primary: true,
    accessRole: "owner",
    accountId: "conn_personal",
    backgroundColor: "#039be5",
    summary: "Personal",
  },
  {
    _id: "cal_personal_holidays",
    primary: false,
    accessRole: "reader",
    accountId: "conn_personal",
    backgroundColor: "#33b679",
    summary: "Holidays in United States",
  },
  {
    _id: "cal_personal_birthdays",
    primary: false,
    accessRole: "reader",
    accountId: "conn_personal",
    backgroundColor: "#e67c73",
    summary: "Birthdays",
  },
  {
    _id: "cal_work_primary",
    primary: true,
    accessRole: "owner",
    accountId: "conn_work",
    backgroundColor: "#7986cb",
    summary: "Work",
  },
  {
    _id: "cal_work_team",
    primary: false,
    accessRole: "reader",
    accountId: "conn_work",
    backgroundColor: "#616161",
    summary: "Team Calendar",
  },
];

export const SEED_EVENTS: CalendarEvent[] = [
  // Monday — focus blocks, meetings, lunch
  {
    _id: "evt_mon_standup",
    localCalendarId: "cal_work_primary",
    summary: "Team standup",
    startMs: at(0, 9, 0),
    endMs: at(0, 9, 30),
    color: "9",
    attendees: [
      { email: "alex@qali.work", displayName: "Alex Kim", response: "accepted" },
      { email: "sam@qali.work", displayName: "Sam Rivera", response: "accepted" },
      { email: "morgan@qali.test", displayName: "Morgan Lee", self: true, response: "accepted" },
    ],
    conferenceUrl: "https://meet.google.com/abc-defg-hij",
  },
  {
    _id: "evt_mon_focus",
    localCalendarId: "cal_personal_primary",
    summary: "Focus block — design review",
    description: "No interruptions until lunch",
    startMs: at(0, 10, 0),
    endMs: at(0, 12, 30),
    color: "8",
  },
  {
    _id: "evt_mon_lunch",
    localCalendarId: "cal_personal_primary",
    summary: "Lunch with Priya",
    location: "Caffè Reggio",
    startMs: at(0, 12, 30),
    endMs: at(0, 13, 30),
    color: "10",
    attendees: [
      { email: "priya@example.com", displayName: "Priya Anand" },
    ],
  },
  {
    _id: "evt_mon_1on1",
    localCalendarId: "cal_work_primary",
    summary: "1:1 with Sam",
    startMs: at(0, 14, 0),
    endMs: at(0, 14, 30),
    color: "9",
    attendees: [
      { email: "sam@qali.work", displayName: "Sam Rivera", response: "accepted" },
      { email: "morgan@qali.test", displayName: "Morgan Lee", self: true, response: "accepted" },
    ],
  },
  {
    _id: "evt_mon_design",
    localCalendarId: "cal_work_primary",
    summary: "Design review",
    description: "Bring the onboarding mocks",
    startMs: at(0, 15, 0),
    endMs: at(0, 16, 30),
    color: "9",
    attendees: [
      { email: "alex@qali.work", displayName: "Alex Kim" },
      { email: "jamie@qali.work", displayName: "Jamie Tan" },
      { email: "morgan@qali.test", displayName: "Morgan Lee", self: true },
    ],
    conferenceUrl: "https://meet.google.com/xyz-pqrs-tuv",
  },

  // Tuesday — deck + dentist
  {
    _id: "evt_tue_morning",
    localCalendarId: "cal_personal_primary",
    summary: "Morning run",
    description: "5K loop in the park",
    startMs: at(1, 7, 0),
    endMs: at(1, 7, 45),
    color: "10",
  },
  {
    _id: "evt_tue_deepwork",
    localCalendarId: "cal_work_primary",
    summary: "Deep work — plan doc",
    startMs: at(1, 9, 30),
    endMs: at(1, 12, 0),
    color: "8",
  },
  {
    _id: "evt_tue_dentist",
    localCalendarId: "cal_personal_primary",
    summary: "Dentist appointment",
    location: "108 Dental, 4th Ave",
    startMs: at(1, 14, 30),
    endMs: at(1, 15, 30),
    color: "5",
  },
  {
    _id: "evt_tue_eod",
    localCalendarId: "cal_work_primary",
    summary: "End-of-day recap",
    startMs: at(1, 16, 30),
    endMs: at(1, 17, 0),
    color: "9",
  },

  // Wednesday — booking-confirmed block + a conflict
  {
    _id: "evt_wed_morning",
    localCalendarId: "cal_work_primary",
    summary: "Async review",
    startMs: at(2, 9, 0),
    endMs: at(2, 9, 15),
    color: "9",
  },
  {
    _id: "evt_wed_external",
    localCalendarId: "cal_personal_primary",
    summary: "Call with Jon (vendor)",
    startMs: at(2, 10, 0),
    endMs: at(2, 10, 30),
    color: "4",
    attendees: [
      { email: "jon@vendor.test", displayName: "Jon Petrov" },
    ],
    conferenceUrl: "https://meet.google.com/qwer-asdf-zxcv",
  },
  {
    _id: "evt_wed_long",
    localCalendarId: "cal_work_primary",
    summary: "Workshop: shipping playbook",
    startMs: at(2, 11, 0),
    endMs: at(2, 13, 30),
    color: "7",
    location: "Conference Room B",
    attendees: [
      { email: "alex@qali.work", displayName: "Alex Kim" },
      { email: "sam@qali.work", displayName: "Sam Rivera" },
      { email: "jamie@qali.work", displayName: "Jamie Tan" },
      { email: "morgan@qali.test", displayName: "Morgan Lee", self: true },
    ],
  },

  // Thursday — interviews
  {
    _id: "evt_thu_interview1",
    localCalendarId: "cal_work_primary",
    summary: "Interview: Backend engineer",
    startMs: at(3, 10, 0),
    endMs: at(3, 11, 0),
    color: "9",
    attendees: [
      { email: "cand1@example.com", displayName: "Candidate A" },
      { email: "morgan@qali.test", displayName: "Morgan Lee", self: true },
    ],
  },
  {
    _id: "evt_thu_interview2",
    localCalendarId: "cal_work_primary",
    summary: "Interview: Backend engineer",
    startMs: at(3, 11, 30),
    endMs: at(3, 12, 30),
    color: "9",
    attendees: [
      { email: "cand2@example.com", displayName: "Candidate B" },
      { email: "morgan@qali.test", displayName: "Morgan Lee", self: true },
    ],
  },
  {
    _id: "evt_thu_lunch",
    localCalendarId: "cal_personal_primary",
    summary: "Lunch with Jamie",
    startMs: at(3, 13, 0),
    endMs: at(3, 14, 0),
    color: "10",
  },

  // Friday — wrap up
  {
    _id: "evt_fri_planning",
    localCalendarId: "cal_work_primary",
    summary: "Sprint planning",
    startMs: at(4, 10, 0),
    endMs: at(4, 11, 30),
    color: "3",
    attendees: [
      { email: "alex@qali.work", displayName: "Alex Kim" },
      { email: "sam@qali.work", displayName: "Sam Rivera" },
      { email: "jamie@qali.work", displayName: "Jamie Tan" },
      { email: "morgan@qali.test", displayName: "Morgan Lee", self: true },
    ],
  },
  {
    _id: "evt_fri_demo",
    localCalendarId: "cal_work_primary",
    summary: "Demo to leadership",
    startMs: at(4, 15, 0),
    endMs: at(4, 16, 0),
    color: "6",
    attendees: [
      { email: "leadership@qali.work", displayName: "Leadership" },
      { email: "morgan@qali.test", displayName: "Morgan Lee", self: true },
    ],
    conferenceUrl: "https://meet.google.com/demo-room",
  },

  // All-day items
  (() => {
    const { startMs, endMs } = isAllDay(2, 0);
    return {
      _id: "evt_wed_allday",
      localCalendarId: "cal_personal_holidays",
      summary: "Conference — Qali offsite",
      startMs,
      endMs,
      allDay: true,
      color: "11",
    };
  })(),

  // Past / next week overflow (so paging never reveals an empty edge)
  {
    _id: "evt_prev_friday",
    localCalendarId: "cal_personal_primary",
    summary: "Coffee with Dad",
    startMs: at(-2, 11, 0),
    endMs: at(-2, 12, 0),
    color: "10",
  },
  {
    _id: "evt_next_monday",
    localCalendarId: "cal_work_primary",
    summary: "Quarterly review",
    startMs: at(7, 14, 0),
    endMs: at(7, 16, 0),
    color: "9",
    attendees: [
      { email: "leadership@qali.work", displayName: "Leadership" },
      { email: "morgan@qali.test", displayName: "Morgan Lee", self: true },
    ],
  },
];

export const SEED_BOOKINGS: Booking[] = [
  {
    _id: "bk_pending_1",
    startMs: at(4, 13, 0),
    endMs: at(4, 13, 30),
    requesterName: "Cameron Reyes",
    requesterEmail: "cameron@example.com",
    note: "Quick chat about a design partnership",
    status: "pending",
    createdAt: SEED_NOW - 1000 * 60 * 60 * 4,
    slotMinutes: 30,
  },
  {
    _id: "bk_confirmed_1",
    startMs: at(3, 9, 30),
    endMs: at(3, 10, 0),
    requesterName: "Jordan Pace",
    requesterEmail: "jordan@example.com",
    status: "confirmed",
    createdAt: SEED_NOW - 1000 * 60 * 60 * 24 * 3,
    slotMinutes: 30,
  },
];

export const SEED_AVAILABILITY: Availability[] = Array.from(
  { length: 7 },
  (_, dayOffset) => ({
    dayKey: formatISO(addDays(WEEK_START, dayOffset), {
      representation: "date",
    }),
    intervals: [
      // Mon-Fri work hours; weekends empty by default
      ...(dayOffset < 5
        ? [
            { startMin: 9 * 60, endMin: 12 * 60 },
            { startMin: 13 * 60, endMin: 17 * 60 },
          ]
        : []),
    ],
  }),
);

export const SEED_NOTIFICATIONS: Notification[] = [
  {
    _id: "ntf_1",
    kind: "booking_request",
    createdAt: SEED_NOW - 1000 * 60 * 12,
    read: false,
    title: "New booking request",
    body: "Cameron Reyes wants a 30-minute meeting on Friday.",
    payload: { bookingId: "bk_pending_1" },
  },
  {
    _id: "ntf_2",
    kind: "booking_confirmed",
    createdAt: SEED_NOW - 1000 * 60 * 60 * 24 * 3,
    read: true,
    title: "Booking confirmed",
    body: "Jordan Pace will join you Thursday at 9:30.",
    payload: { bookingId: "bk_confirmed_1" },
  },
  {
    _id: "ntf_3",
    kind: "reminder",
    createdAt: SEED_NOW - 1000 * 60 * 60 * 26,
    read: true,
    title: "Tomorrow's standup",
    body: "Don't forget to review the agenda.",
  },
];

/** Public booking-page state for the seed slug. */
export const SEED_PUBLIC_PAGE = (
  slug: string,
): { displayName: string; imageUrl?: string; title?: string; description?: string; slotMinutes: number; visitorZone: string } => ({
  displayName: SEED_USER.displayName,
  title: "30-minute intro chat",
  description:
    "Pick any open slot — I'll confirm by email within a few hours. Looking forward to it!",
  slotMinutes: 30,
  visitorZone:
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC",
});

/** Build a half-open slot grid for the public page within a window. */
export function seedSlots(_slug: string, fromMs: number, toMs: number) {
  const slots: { startMs: number; available: boolean }[] = [];
  let cursor = fromMs;
  // Anchor to the next half-hour.
  cursor = Math.ceil(cursor / (30 * 60 * 1000)) * (30 * 60 * 1000);
  while (cursor + 30 * 60 * 1000 <= toMs) {
    const hourOfDay = new Date(cursor).getHours();
    const dayOfWeek = new Date(cursor).getDay();
    // "Open" 9-12 / 13-17 weekdays — close weekends and off-hours, plus remove
    // a few specific seeds to look realistic.
    const inHours = hourOfDay >= 9 && hourOfDay < 17;
    const weekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const taken = SEED_EVENTS.some((e) => e.startMs === cursor);
    slots.push({
      startMs: cursor,
      available: inHours && weekday && !taken,
    });
    cursor = addMinutes(cursor, 30).getTime();
  }
  return slots;
}
