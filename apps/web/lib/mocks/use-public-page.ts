"use client";

import { useMemo } from "react";

import { seedSlots, SEED_PUBLIC_PAGE } from "./seed";
import type { PublicBookingPage } from "./types";

export type PublicPageState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "ok"; page: PublicBookingPage };

/** Mirrors `getPublicPage(slug)` from the backend. */
export function usePublicBookingPage(slug: string): PublicPageState {
  return useMemo<PublicPageState>(() => {
    // Any non-empty slug returns the seed profile so /<anything> resolves.
    if (!slug || slug === "__missing__") return { kind: "not-found" };
    return { kind: "ok", page: SEED_PUBLIC_PAGE(slug) };
  }, [slug]);
}

export type SlotGridState = { kind: "loading" } | { kind: "ok"; slotMinutes: number; slots: { startMs: number; available: boolean }[] };

export function useListBookingSlots(
  slug: string,
  fromMs: number,
  toMs: number,
  nowMs: number,
): SlotGridState {
  return useMemo<SlotGridState>(() => {
    if (!slug) return { kind: "loading" };
    const slots = seedSlots(slug, fromMs, toMs).filter(
      (s) => s.startMs >= nowMs + 5 * 60 * 1000,
    );
    return { kind: "ok", slotMinutes: 30, slots };
  }, [slug, fromMs, toMs, nowMs]);
}

export function useRequestBooking() {
  return async (input: {
    slug: string;
    startMs: number;
    name: string;
    email: string;
    note?: string;
  }) => {
    // Simulated: produce a deterministic "token" so the confirmation page has
    // something to show.
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { token: `tok_${Math.random().toString(36).slice(2, 10)}` };
  };
}
