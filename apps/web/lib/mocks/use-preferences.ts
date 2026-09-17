"use client";

import { useMemo } from "react";

import type { UserPreferences, UserProfile } from "./types";
import { useMocks } from "./provider";

export function useMyUser(): UserProfile {
  const { state } = useMocks();
  return state.user;
}

export function useMyPreferences(): UserPreferences {
  const { state } = useMocks();
  return state.preferences;
}

export function useSetPreferences() {
  const { setPreferences } = useMocks();
  return useMemo(
    () => async (patch: Partial<UserPreferences>) => {
      setPreferences(patch);
    },
    [setPreferences],
  );
}
