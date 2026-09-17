"use client";

import { useMemo } from "react";

import type { Booking } from "./types";
import { useMocks } from "./provider";

export const NO_BOOKINGS: Booking[] = [];

export function useListBookings() {
  const { state } = useMocks();
  return useMemo<Booking[]>(() => {
    if (state.bookings.length === 0) return NO_BOOKINGS;
    return [...state.bookings].sort((a, b) => a.startMs - b.startMs);
  }, [state.bookings]);
}

export function useDecideBooking() {
  const { decideBooking } = useMocks();
  return useMemo(
    () => async (id: string, status: "confirmed" | "declined") => {
      decideBooking(id, status);
    },
    [decideBooking],
  );
}
