"use client";

import { useMemo } from "react";

import type { CalendarListItem, Connection } from "./types";
import { useMocks } from "./provider";

export const NO_CALENDARS: SelectedCalendar[] = [];

export type SelectedCalendar = CalendarListItem & { selected: boolean };

export function useListCalendars(): SelectedCalendar[] {
  const { state } = useMocks();
  return useMemo<SelectedCalendar[]>(() => {
    if (state.calendars.length === 0) return NO_CALENDARS;
    return state.calendars.map((c) => ({
      ...c,
      selected: state.selectedCalendarIds.has(c._id),
    }));
  }, [state.calendars, state.selectedCalendarIds]);
}

export function useListConnections() {
  const { state } = useMocks();
  return useMemo<Connection[]>(() => state.connections, [state.connections]);
}

export function useSetCalendarSelected() {
  const { setCalendarSelected } = useMocks();
  return useMemo(
    () => async (input: { calendarId: string; selected: boolean }) => {
      setCalendarSelected(input.calendarId, input.selected);
    },
    [setCalendarSelected],
  );
}
