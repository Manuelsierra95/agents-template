"use client";

import { useMemo } from "react";

import type { Availability } from "./types";
import { useMocks } from "./provider";

export function useMyAvailability() {
  const { state } = useMocks();
  return useMemo<Availability[]>(() => state.availability, [state.availability]);
}

export function useSetAvailability() {
  const { setAvailability } = useMocks();
  return useMemo(
    () => async (dayKey: string, intervals: Availability["intervals"]) => {
      setAvailability(dayKey, intervals);
    },
    [setAvailability],
  );
}
