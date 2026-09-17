// A small, dependency-free RFC5545 recurrence model. We only ever *emit* rules
// (Google is the source of truth and syncs expanded instances back), so there is
// no parser here — just a typed model, a string builder, and a human summary.
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { zoned } from "./lib";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const DAY_CODES: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

const FREQ_NOUN: Record<Freq, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};

type RecurrenceEnd =
  | { kind: "never" }
  | { kind: "onDate"; dateMs: number }
  | { kind: "count"; count: number };

export interface Recurrence {
  freq: Freq;
  interval: number;
  byWeekday?: Weekday[];
  end: RecurrenceEnd;
}

export function parseRRule(
  lines: string[],
  timeZone: string,
): Recurrence | null {
  const line = lines.find((candidate) => candidate.startsWith("RRULE:"));
  if (!line) return null;

  const fields = new Map<string, string>();
  for (const part of line.slice("RRULE:".length).split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) return null;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (!value || fields.has(key)) return null;
    fields.set(key, value);
  }

  const supported = new Set(["FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL", "WKST"]);
  if ([...fields.keys()].some((key) => !supported.has(key))) return null;

  const freq = fields.get("FREQ");
  if (!isFreq(freq)) return null;

  const intervalText = fields.get("INTERVAL");
  const interval =
    intervalText === undefined ? 1 : positiveInteger(intervalText);
  if (interval === null) return null;

  const byDayText = fields.get("BYDAY");
  let byWeekday: Weekday[] | undefined;
  if (byDayText !== undefined) {
    if (freq !== "WEEKLY") return null;
    const days = byDayText.split(",");
    if (days.length === 0 || days.some((day) => !isWeekday(day))) return null;
    byWeekday = [...new Set(days)] as Weekday[];
  }

  const countText = fields.get("COUNT");
  const untilText = fields.get("UNTIL");
  if (countText !== undefined && untilText !== undefined) return null;

  let end: RecurrenceEnd = { kind: "never" };
  if (countText !== undefined) {
    const count = positiveInteger(countText);
    if (count === null) return null;
    end = { kind: "count", count };
  } else if (untilText !== undefined) {
    const dateMs = parseUntilDate(untilText, timeZone);
    if (dateMs === null) return null;
    end = { kind: "onDate", dateMs };
  }

  return { freq, interval, byWeekday, end };
}

export function weekdayOf(ms: number, timeZone: string): Weekday {
  const day = zoned(ms, timeZone).getDay();
  return (DAY_CODES[day] ?? "SU") as Weekday;
}

export function defaultRecurrence(
  startMs: number,
  timeZone: string,
): Recurrence {
  return {
    freq: "WEEKLY",
    interval: 1,
    byWeekday: [weekdayOf(startMs, timeZone)],
    end: { kind: "never" },
  };
}

function sortWeekdays(days: Weekday[]): Weekday[] {
  return WEEKDAYS.filter((d) => days.includes(d));
}

const FREQ_ADVERB: Record<Freq, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Annually",
};

export function summarize(r: Recurrence, timeZone: string): string {
  let base =
    r.interval > 1 ? `Every ${r.interval} ${FREQ_NOUN[r.freq]}s` : FREQ_ADVERB[r.freq];
  if (r.freq === "WEEKLY" && r.byWeekday && r.byWeekday.length > 0) {
    const days = sortWeekdays(r.byWeekday)
      .map((d) => WEEKDAY_LABEL[d])
      .join(", ");
    base += ` on ${days}`;
  }
  if (r.end.kind === "count") {
    base += ` · ${r.end.count} time${r.end.count === 1 ? "" : "s"}`;
  } else if (r.end.kind === "onDate") {
    base += ` · until ${format(zoned(r.end.dateMs, timeZone), "MMM d, yyyy")}`;
  }
  return base;
}

function isFreq(value: string | undefined): value is Freq {
  return (
    value === "DAILY" ||
    value === "WEEKLY" ||
    value === "MONTHLY" ||
    value === "YEARLY"
  );
}

function isWeekday(value: string): value is Weekday {
  return WEEKDAYS.includes(value as Weekday);
}

function positiveInteger(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseUntilDate(value: string, timeZone: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/.exec(
    value,
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  if (match[4] !== undefined) {
    const instant = Date.UTC(
      year,
      month - 1,
      day,
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    );
    const d = zoned(instant, timeZone);
    return new TZDate(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      timeZone,
    ).getTime();
  }
  return new TZDate(year, month - 1, day, timeZone).getTime();
}
