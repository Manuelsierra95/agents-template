import { useMemo } from "react";

import type {
  CalendarEvent as UICalendarEvent,
  CalendarListItem,
} from "@/lib/calendar/types";
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

/**
 * Resolve an event to a CSS variable in our palette.
 *
 * The wire shape no longer carries `localCalendarId` — events belong to the
 * organisation, not a "calendar" entity — so the only signal we have is
 * `event.color` (a Google palette key like `"6"`). When that's missing we
 * fall back to a hash of the event id so two uncoloured events never share
 * a strip.
 */
function eventColorVar(
  event: UICalendarEvent,
  _calendarColors?: Map<string, string | undefined>,
): string {
  const hex = event.color ? GOOGLE_EVENT_COLORS[event.color] : undefined;
  return hex ? snapToPalette(hex) : hashedVar(event.id);
}

export function useEventColor(): (event: UICalendarEvent) => string {
  const calendars = useListCalendars();
  return useMemo(() => {
    // `calendars` is still consumed so the hook signature stays stable for
    // callers; once we delete the calendars mock we'll stop calling this
    // here too. The map is no longer used to colour events but is built so
    // a debug overlay can still inspect the mock layer.
    const _colors = new Map<string, string | undefined>();
    for (const c of calendars) _colors.set(c._id, c.backgroundColor);
    void _colors;
    return (event: UICalendarEvent) => eventColorVar(event);
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
