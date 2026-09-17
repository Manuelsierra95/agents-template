import { useMemo } from "react";

import type { CalendarEvent, CalendarListItem } from "@/lib/mocks/types";
import { useListCalendars } from "@/lib/mocks/use-calendars";

const GOOGLE_EVENT_COLORS: Record<string, string> = {
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#f6c026",
  "6": "#f5511d",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d60000",
};

const PALETTE_HUES = [20, 50, 90, 150, 195, 240, 285, 325];

const NEUTRAL_CHROMA = 0.03;
const NEUTRAL_VAR = "--event-neutral";

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToChromaHue(hex: string): { chroma: number; hue: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  const int = Number.parseInt(m[1], 16);
  const r = srgbToLinear(((int >> 16) & 0xff) / 255);
  const g = srgbToLinear(((int >> 8) & 0xff) / 255);
  const b = srgbToLinear((int & 0xff) / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m2 = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817180371 * g + 0.6299787005 * b);
  const labA = 1.9779984951 * l - 2.428592205 * m2 + 0.4505937099 * s;
  const labB =
    0.0259040371 * l + 0.7827717662 * m2 - 0.808675766 * s;

  return {
    chroma: Math.hypot(labA, labB),
    hue: (Math.atan2(labB, labA) * (180 / Math.PI) + 360) % 360,
  };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const snapCache = new Map<string, string>();

function snapToPalette(hex: string): string {
  const cached = snapCache.get(hex);
  if (cached) return cached;

  const oklch = hexToChromaHue(hex);
  let result = NEUTRAL_VAR;
  if (oklch && oklch.chroma >= NEUTRAL_CHROMA) {
    let best = 0;
    for (let i = 1; i < PALETTE_HUES.length; i++) {
      const hueI = PALETTE_HUES[i];
      const hueBest = PALETTE_HUES[best];
      if (hueI === undefined || hueBest === undefined) continue;
      if (
        hueDistance(oklch.hue, hueI) < hueDistance(oklch.hue, hueBest)
      ) {
        best = i;
      }
    }
    result = `--event-${best + 1}`;
  }
  snapCache.set(hex, result);
  return result;
}

export const EVENT_COLOR_CHOICES: { color: string; colorVar: string }[] =
  (() => {
    const byVar = new Map<string, string>();
    for (const [color, hex] of Object.entries(GOOGLE_EVENT_COLORS)) {
      const colorVar = snapToPalette(hex);
      if (!byVar.has(colorVar)) byVar.set(colorVar, color);
    }
    const order = [
      ...PALETTE_HUES.map((_, i) => `--event-${i + 1}`),
      NEUTRAL_VAR,
    ];
    return order
      .filter((colorVar) => byVar.has(colorVar))
      .map((colorVar) => ({ colorVar, color: byVar.get(colorVar) as string }));
  })();

function hashedVar(id: string): string {
  let hash = 0;
  for (const ch of id) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return `--event-${(Math.abs(hash) % PALETTE_HUES.length) + 1}`;
}

function eventColorVar(
  event: CalendarEvent,
  calendarColors?: Map<string, string | undefined>,
): string {
  const own = event.color ? GOOGLE_EVENT_COLORS[event.color] : undefined;
  const hex =
    own ??
    (event.localCalendarId
      ? calendarColors?.get(event.localCalendarId)
      : undefined);
  return hex ? snapToPalette(hex) : hashedVar(event.localCalendarId ?? event._id);
}

export function useEventColor(): (event: CalendarEvent) => string {
  const calendars = useListCalendars();
  return useMemo(() => {
    const colors = new Map<string, string | undefined>();
    for (const c of calendars) colors.set(c._id, c.backgroundColor);
    return (event: CalendarEvent) => eventColorVar(event, colors);
  }, [calendars]);
}

export function calendarColorVar(calendar: {
  _id: string;
  backgroundColor?: string;
}): string {
  return calendar.backgroundColor
    ? snapToPalette(calendar.backgroundColor)
    : hashedVar(calendar._id);
}
