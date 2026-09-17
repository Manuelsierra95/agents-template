import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  isSameMonth,
  isSameYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type {
  Attendee,
  CalendarEvent,
  CalendarListItem,
  Connection,
} from "@/lib/mocks/types";

// ── Time-zone helpers ────────────────────────────────────────────────────────

/** Convert UTC-midnight (Google all-day storage) to a working-zone instant on
 * the same calendar date. Noon, so no DST shift can tip it. */
export function fromUtcMidnight(ms: number, timeZone: string): number {
  const d = new Date(ms);
  return new TZDate(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    12,
    timeZone,
  ).getTime();
}

export function eventTimeParts(
  event: Pick<CalendarEvent, "allDay" | "startMs" | "endMs">,
  use24h: boolean,
  timeZone: string,
):
  | { allDay: true; start: TZDate; lastDay: TZDate }
  | { allDay: false; start: TZDate; end: TZDate; time: string; endText: string } {
  if (event.allDay) {
    const start = zoned(fromUtcMidnight(event.startMs, timeZone), timeZone);
    const lastDay = zoned(
      fromUtcMidnight(event.endMs - MS_PER_DAY, timeZone),
      timeZone,
    );
    return { allDay: true, start, lastDay };
  }
  const start = zoned(event.startMs, timeZone);
  const end = zoned(event.endMs, timeZone);
  const time = timePattern(use24h);
  const endText = format(
    end,
    isSameDay(start, end) ? time : `EEE d MMM, ${time}`,
  );
  return { allDay: false, start, end, time, endText };
}

export function zoned(ms: number, timeZone: string): TZDate {
  return new TZDate(ms, timeZone);
}

export function zonedNow(timeZone: string): TZDate {
  return new TZDate(Date.now(), timeZone);
}

// ── Calendar writability / grouping ──────────────────────────────────────────

export type { CalendarEvent, CalendarListItem, Connection };

const WRITABLE_ACCESS_ROLES = new Set(["owner", "writer"]);

export function isWritableCalendar(calendar: {
  accessRole?: string;
}): boolean {
  return WRITABLE_ACCESS_ROLES.has(calendar.accessRole ?? "");
}

/** Pick a primary calendar deterministically: first primary in the list. With
 * a single Google account, the backend's order already de-conflicts; with
 * multiple, the seed always returns one primary per account. */
export function pickPrimaryCalendar(
  calendars: CalendarListItem[],
): CalendarListItem | undefined {
  const primaries = calendars.filter((c) => c.primary);
  if (primaries.length <= 1) return primaries[0];
  // No connections ordering — fall back to the first primary.
  return primaries[0];
}

export function groupCalendarsByAccount(
  calendars: CalendarListItem[],
  connections: Connection[],
): { key: string; label?: string; calendars: CalendarListItem[] }[] {
  if (connections.length <= 1) {
    return calendars.length > 0 ? [{ key: "all", calendars }] : [];
  }
  const ordered = [...connections].sort((a, b) => a._id.localeCompare(b._id));
  const known = new Set<string>(ordered.map((c) => c._id));
  const groups = ordered.map((connection) => ({
    key: connection._id,
    label: connection.email || "Connected account",
    calendars: calendars.filter((c) => c.accountId === connection._id),
  }));
  const orphans = calendars.filter(
    (c) => !c.accountId || !known.has(c.accountId),
  );
  if (orphans.length > 0) {
    groups.push({ key: "other", label: "Other", calendars: orphans });
  }
  return groups.filter((group) => group.calendars.length > 0);
}

export function calendarDisplayName(calendar: {
  summary?: string;
}): string {
  return calendar.summary ?? "";
}

// ── Week / view constants ─────────────────────────────────────────────────────

export const SNAP_MINUTES = 15;

export type WeekStart = 0 | 1 | 6;

export const WEEK_STARTS_ON: WeekStart = 1;

export type CalendarView = "day" | "week" | "month";

export const VIEW_BUFFER: Record<CalendarView, number> = {
  day: 7,
  week: 2,
  month: 1,
};

type StripView = Exclude<CalendarView, "month">;
export const VIEW_COLUMNS: Record<StripView, number> = { day: 1, week: 7 };
export const VIEW_NAV_DAYS: Record<StripView, number> = { day: 1, week: 3 };
export const STRIP_SIDE_DAYS: Record<StripView, number> = {
  day: VIEW_BUFFER.day * VIEW_COLUMNS.day,
  week: VIEW_BUFFER.week * VIEW_COLUMNS.week,
};

/** Interned day starts, so the same calendar day is always the same `Date`
 * object. Stepping the anchor rebuilds the strip but keeps all but one column's
 * `day` prop referentially equal. */
const dayCache = new Map<string, Date>();
const DAY_CACHE_LIMIT = 512;

function internDay(date: Date): Date {
  const key = `${date instanceof TZDate ? date.timeZone : "local"}:${date.getTime()}`;
  const cached = dayCache.get(key);
  if (cached) return cached;
  if (dayCache.size >= DAY_CACHE_LIMIT) dayCache.clear();
  dayCache.set(key, date);
  return date;
}

export function stripDays(anchor: Date, columns: number, side: number): Date[] {
  const total = side + columns + side;
  return Array.from({ length: total }, (_, i) =>
    internDay(addDays(anchor, i - side)),
  );
}

const QUERY_SIDE_WEEKS = 2 * VIEW_BUFFER.week + 1;
const QUERY_SIDE_MONTHS = 2 * VIEW_BUFFER.month + 1;

export function eventQueryRange(
  view: CalendarView,
  anchor: Date,
  weekStartsOn: WeekStart = WEEK_STARTS_ON,
): { startMs: number; endMs: number } {
  if (view === "month") {
    const base = startOfMonth(anchor);
    return {
      startMs: addMonths(base, -QUERY_SIDE_MONTHS).getTime(),
      endMs: addMonths(base, QUERY_SIDE_MONTHS + 1).getTime(),
    };
  }
  const base = startOfWeek(anchor, { weekStartsOn });
  return {
    startMs: addWeeks(base, -QUERY_SIDE_WEEKS).getTime(),
    endMs: addWeeks(base, QUERY_SIDE_WEEKS + 1).getTime(),
  };
}

export function pageStart(
  view: CalendarView,
  date: Date,
  weekStartsOn: WeekStart = WEEK_STARTS_ON,
): Date {
  switch (view) {
    case "day":
      return startOfDay(date);
    case "week":
      return startOfWeek(date, { weekStartsOn });
    case "month":
      return startOfMonth(date);
  }
}

export function addPages(view: CalendarView, start: Date, n: number): Date {
  switch (view) {
    case "day":
      return addDays(start, n);
    case "week":
      return addWeeks(start, n);
    case "month":
      return addMonths(start, n);
  }
}

export function pageDays(
  view: CalendarView,
  start: Date,
  weekStartsOn: WeekStart = WEEK_STARTS_ON,
): Date[] {
  if (view === "day") return [start];
  if (view === "week")
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const gridStart = startOfWeek(start, { weekStartsOn });
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function viewTitle(view: CalendarView, start: Date): string {
  if (view === "day") return format(start, "EEEE, MMM d, yyyy");
  if (view === "month") return format(start, "MMMM yyyy");
  const last = addDays(start, 6);
  if (isSameMonth(start, last)) return format(start, "MMMM yyyy");
  const firstFmt = isSameYear(start, last) ? "MMM" : "MMM yyyy";
  return `${format(start, firstFmt)} – ${format(last, "MMM yyyy")}`;
}

// ── Scroll-settle mechanics ──────────────────────────────────────────────────

export const SNAP_EPSILON = 2;
export const SETTLE_IDLE_MS = 140;
export const SETTLE_BACKSTOP_MS = 400;
export const SUPPORTS_SCROLL_END =
  typeof window !== "undefined" && "onscrollend" in window;

/** Floor for an hour row in the time grid. The calendar ships a denser
 * floor (60px/h, vs. the 40px/h that ships in calendar-v1) so a 15-min event
 * renders at 15px natural instead of 10px — this is what lets
 * `event-card`'s `min-h-[20px]` extend short events without colliding with
 * back-to-back siblings (a 15-min card ends at ~9:18 instead of ~9:15 with
 * the old 40px/h floor, which was the original overlap bug). 60px/h still
 * keeps the 24h grid inside a scrollable 1440px column on standard viewports
 * (overflow-auto on the time-strip scroller). */
const MIN_HOUR_HEIGHT = 60;
export const MIN_DAY_HEIGHT = 24 * MIN_HOUR_HEIGHT;
export const TIME_GRID_BOTTOM_SPACER_HEIGHT = 96;

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const SNAP_MS = SNAP_MINUTES * MS_PER_MINUTE;

export function formatWallClockMinutes(
  minutes: number,
  includeDayPeriod = true,
  use24h = false,
): string {
  const normalized = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const paddedMinute = String(minute).padStart(2, "0");
  if (use24h) return `${String(hour24).padStart(2, "0")}:${paddedMinute}`;
  const hour12 = hour24 % 12 || 12;
  const time = `${hour12}:${paddedMinute}`;
  if (!includeDayPeriod) return time;
  return `${time} ${hour24 < 12 ? "AM" : "PM"}`;
}

export function timePattern(use24h: boolean, withDayPeriod = true): string {
  if (use24h) return "HH:mm";
  return withDayPeriod ? "h:mm a" : "h:mm";
}

const DEFAULT_EVENT_START_MINUTES = 9 * 60;
const DEFAULT_EVENT_DURATION_MS = 30 * MS_PER_MINUTE;

export const MONTH_EVENT_ROW_HEIGHT = 18;
const MONTH_EVENT_ROW_GAP = 2;

export function visibleMonthEventMetrics(
  eventCount: number,
  availableHeight: number,
): { visibleCount: number; hiddenCount: number } {
  const availableRows = Math.max(
    Math.floor(
      (availableHeight + MONTH_EVENT_ROW_GAP) /
        (MONTH_EVENT_ROW_HEIGHT + MONTH_EVENT_ROW_GAP),
    ),
    0,
  );
  const visibleCount =
    eventCount <= availableRows ? eventCount : Math.max(availableRows - 1, 0);

  return { visibleCount, hiddenCount: eventCount - visibleCount };
}

// ── Time zone gutters ────────────────────────────────────────────────────────

function zoneShortLabel(zone: string): string {
  return zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
}

export function timezoneGutters(
  workingZone: string,
): { id: string; label: string }[] {
  return [{ id: workingZone, label: zoneShortLabel(workingZone) }];
}

export const GUTTER_WIDTH = 64;
export const GUTTER_TOTAL = GUTTER_WIDTH * timezoneGutters("UTC").length;

export function dayColsTemplate(n: number): string {
  return `repeat(${n}, minmax(0, 1fr))`;
}

export const HEADER_DATE_HEIGHT = 44;
export const ALLDAY_COLLAPSED_LANES = 2;
const ALLDAY_MAX_EXPANDED_LANES = 8;
export const ALLDAY_EVENT_HEIGHT = 20;
export const ALLDAY_EVENT_GAP = 4;
export const ALLDAY_BAND_PADDING = 4;

export function allDayBandHeight(laneCount: number, expanded: boolean): number {
  const visibleLanes = expanded
    ? Math.min(Math.max(laneCount, 1), ALLDAY_MAX_EXPANDED_LANES)
    : Math.max(Math.min(laneCount, ALLDAY_COLLAPSED_LANES), 1);
  return (
    ALLDAY_BAND_PADDING * 2 +
    visibleLanes * ALLDAY_EVENT_HEIGHT +
    (visibleLanes - 1) * ALLDAY_EVENT_GAP
  );
}

export function bucketDayEvents(
  days: Date[],
  events: CalendarEvent[],
): { allDayEvents: CalendarEvent[]; timedByDay: CalendarEvent[][] } {
  const dayStarts = days.map((day) => day.getTime());
  const firstDayStart = dayStarts[0];
  const lastDayStart = dayStarts[dayStarts.length - 1];
  if (firstDayStart === undefined || lastDayStart === undefined) {
    return { allDayEvents: [], timedByDay: days.map(() => []) };
  }
  const rangeStartMs = firstDayStart;
  const rangeEndMs = lastDayStart + MS_PER_DAY;
  const allDayEvents: CalendarEvent[] = [];
  const timedByDay: CalendarEvent[][] = days.map(() => []);
  for (const event of events) {
    if (event.allDay) {
      if (event.endMs > rangeStartMs && event.startMs < rangeEndMs) {
        allDayEvents.push(event);
      }
      continue;
    }
    for (let i = 0; i < dayStarts.length; i++) {
      const dayStartMs = dayStarts[i];
      if (dayStartMs === undefined) continue;
      if (dayStartMs >= event.endMs) break;
      if (dayStartMs + MS_PER_DAY <= event.startMs) continue;
      const target = timedByDay[i];
      if (target) target.push(event);
    }
  }
  allDayEvents.sort((a, b) => a.startMs - b.startMs);
  return { allDayEvents, timedByDay };
}

function allDayColumnSpan(
  event: CalendarEvent,
  days: Date[],
): { startIdx: number; endIdx: number } {
  const first = days[0];
  if (!first) {
    return { startIdx: 0, endIdx: 0 };
  }
  const base = Date.UTC(
    first.getFullYear(),
    first.getMonth(),
    first.getDate(),
  );
  const lastIdx = days.length - 1;
  const startIdx = Math.round((event.startMs - base) / MS_PER_DAY);
  const endIdx = Math.round((event.endMs - MS_PER_DAY - base) / MS_PER_DAY);
  return {
    startIdx: Math.max(startIdx, 0),
    endIdx: Math.min(Math.max(endIdx, startIdx), lastIdx),
  };
}

export interface AllDayEventLayout {
  event: CalendarEvent;
  startIdx: number;
  endIdx: number;
  lane: number;
}

export function layoutAllDayEvents(
  days: Date[],
  events: CalendarEvent[],
  visibleStartIdx = 0,
  visibleEndIdx = days.length - 1,
): AllDayEventLayout[] {
  const spans = events
    .map((event) => ({ event, ...allDayColumnSpan(event, days) }))
    .sort(
      (a, b) =>
        a.startIdx - b.startIdx ||
        b.endIdx - a.endIdx ||
        a.event.startMs - b.event.startMs ||
        String(a.event._id).localeCompare(String(b.event._id)),
    );
  const laneEnds: number[] = [];

  return spans
    .map((span) => {
      let lane = laneEnds.findIndex((endIdx) => endIdx < span.startIdx);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = span.endIdx;
      return { ...span, lane };
    })
    .filter(
      ({ startIdx, endIdx }) =>
        endIdx >= visibleStartIdx && startIdx <= visibleEndIdx,
    )
    .map((entry) => ({
      ...entry,
      startIdx: Math.max(entry.startIdx, visibleStartIdx),
      endIdx: Math.min(entry.endIdx, visibleEndIdx),
    }));
}

export function visibleAllDayMetrics(
  events: AllDayEventLayout[],
  visibleStartIdx: number,
  visibleEndIdx: number,
): { laneCount: number; hiddenEventCount: number } {
  let laneCount = 0;
  let hiddenEventCount = 0;

  for (const event of events) {
    if (event.endIdx < visibleStartIdx || event.startIdx > visibleEndIdx)
      continue;
    laneCount = Math.max(laneCount, event.lane + 1);
    if (event.lane >= ALLDAY_COLLAPSED_LANES) hiddenEventCount += 1;
  }

  return { laneCount, hiddenEventCount };
}

export function msToPct(ms: number, dayStartMs: number): number {
  return ((ms - dayStartMs) / MS_PER_DAY) * 100;
}

export function dayKey(date: Date | number): string {
  return `day:${startOfDay(date).getTime()}`;
}

export function snappedMsFromOffsetY(
  offsetY: number,
  dayStartMs: number,
  dayHeightPx: number,
): number {
  const steps = Math.round(
    (offsetY / dayHeightPx) * ((24 * 60) / SNAP_MINUTES),
  );
  const ms = dayStartMs + steps * SNAP_MS;
  return Math.min(
    Math.max(ms, dayStartMs),
    dayStartMs + MS_PER_DAY,
  );
}

export interface PositionedEvent {
  event: CalendarEvent;
  topPct: number;
  heightPct: number;
  stackIndex: number;
  stackCount: number;
  elevation: number;
  columnIndex: number;
  columnCount: number;
  columnSpan: number;
  laneAdvance: number;
}

export const EVENT_LEFT_GUTTER_PX = 12;

const STACK_INDENT_PX = 14;
const STACK_MAX_LEVELS = 3;
const STACK_DEEP_STEP_PX = 4;

export function stackIndentPx(stackIndex: number): number {
  const capped = Math.min(stackIndex, STACK_MAX_LEVELS);
  const overflow = Math.max(0, stackIndex - STACK_MAX_LEVELS);
  return capped * STACK_INDENT_PX + overflow * STACK_DEEP_STEP_PX;
}

const LANE_ADVANCE_RATIO = 0.62;

export const LANE_TILE_MAX_STAGGER_MS = 30 * MS_PER_MINUTE;
export const WEEK_LANE_TILE_MAX_STAGGER_MS = 45 * MS_PER_MINUTE;

export function laneBox(
  columnIndex: number,
  columnCount: number,
  columnSpan: number,
  advance: number = LANE_ADVANCE_RATIO,
): { left: number; width: number } {
  if (columnCount <= 1) return { left: 0, width: 1 };
  const width = 1 / (1 + (columnCount - 1) * advance);
  const step = advance * width;
  return { left: columnIndex * step, width: width + (columnSpan - 1) * step };
}

export function layoutDayEvents(
  events: CalendarEvent[],
  dayStartMs: number,
  tileMaxStaggerMs: number = LANE_TILE_MAX_STAGGER_MS,
): PositionedEvent[] {
  const dayEndMs = dayStartMs + MS_PER_DAY;
  const items = events
    .map((event) => {
      const start = Math.max(event.startMs, dayStartMs);
      const end = Math.min(
        Math.max(event.endMs, start + SNAP_MS),
        dayEndMs,
      );
      return {
        event,
        start,
        end,
        stackIndex: 0,
        stackCount: 1,
        elevation: 0,
        columnIndex: 0,
        columnCount: 1,
        columnSpan: 1,
        laneAdvance: LANE_ADVANCE_RATIO,
      };
    })
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  let cluster: typeof items = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    if (cluster.length === 0) return;
    for (const item of cluster) item.stackCount = cluster.length;

    const laneEnds: number[] = [];
    for (const item of cluster) {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.end;
      item.columnIndex = lane;
    }
    const columnCount = laneEnds.length;
    for (const item of cluster) {
      item.columnCount = columnCount;
      let span = columnCount - item.columnIndex;
      for (const other of cluster) {
        if (other === item || other.columnIndex <= item.columnIndex) continue;
        if (other.start < item.end && other.end > item.start) {
          span = Math.min(span, other.columnIndex - item.columnIndex);
        }
      }
      item.columnSpan = Math.max(span, 1);
    }

    let tiled = false;
    for (let i = 0; i < cluster.length && !tiled; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const a = cluster[i];
        const b = cluster[j];
        if (!a || !b) continue;
        const overlap = a.start < b.end && b.start < a.end;
        if (overlap && Math.abs(a.start - b.start) < tileMaxStaggerMs) {
          tiled = true;
          break;
        }
      }
    }
    const advance = tiled ? 1 : LANE_ADVANCE_RATIO;
    for (const item of cluster) item.laneAdvance = advance;

    cluster = [];
  };

  for (const item of items) {
    if (item.start >= clusterEnd) closeCluster();
    item.stackIndex = cluster.filter((prev) => prev.end > item.start).length;
    item.elevation = cluster.length;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  closeCluster();

  return items.map(
    ({
      event,
      start,
      end,
      stackIndex,
      stackCount,
      elevation,
      columnIndex,
      columnCount,
      columnSpan,
      laneAdvance,
    }) => ({
      event,
      topPct: msToPct(start, dayStartMs),
      heightPct: msToPct(end, dayStartMs) - msToPct(start, dayStartMs),
      stackIndex,
      stackCount,
      elevation,
      columnIndex,
      columnCount,
      columnSpan,
      laneAdvance,
    }),
  );
}

// Event/calendar colors live in ./colors.ts.
