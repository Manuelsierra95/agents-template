"use client";

import { useMemo } from "react";

import type { CalendarEvent } from "./types";
import { useMocks } from "./provider";

/**
 * Stable empty fallback so consumers' memoization (the day column's per-event
 * identity) keeps working across renders when there are no events yet.
 */
export const NO_EVENTS: CalendarEvent[] = [];

export function useListEventsInRange(input: { startMs: number; endMs: number }) {
  const { state } = useMocks();
  return useMemo<CalendarEvent[]>(() => {
    const all = state.events;
    const filtered = all.filter(
      (e) => e.endMs >= input.startMs && e.startMs <= input.endMs,
    );
    // Stable identity if the result set is the same.
    if (filtered.length === 0 && all.length === 0) return NO_EVENTS;
    return filtered;
  }, [state.events, input.startMs, input.endMs]);
}

export function useCreateEvent() {
  const { upsertEvent } = useMocks();
  return useMemo(
    () => async (event: Omit<CalendarEvent, "_id"> & { _id?: string }) => {
      const id = event._id ?? `evt_${Math.random().toString(36).slice(2, 10)}`;
      upsertEvent({ ...event, _id: id });
      return id;
    },
    [upsertEvent],
  );
}

export function useUpdateEvent() {
  const { upsertEvent } = useMocks();
  return useMemo(
    () => async (event: CalendarEvent) => {
      upsertEvent(event);
    },
    [upsertEvent],
  );
}

export function useDeleteEvent() {
  const { deleteEvent } = useMocks();
  return useMemo(
    () => async (id: string) => {
      deleteEvent(id);
    },
    [deleteEvent],
  );
}

export function useMoveEvent() {
  const { moveEvent } = useMocks();
  return useMemo(
    () => async (id: string, startMs: number, endMs: number) => {
      moveEvent(id, startMs, endMs);
    },
    [moveEvent],
  );
}
