"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { startOfDay } from "date-fns";

import type {
  Availability,
  Booking,
  CalendarEvent,
  CalendarListItem,
  UserPreferences,
} from "@/lib/mocks/types";
import { useMocks } from "@/lib/mocks";
import { useMyPreferences } from "@/lib/mocks/use-preferences";

/** The dock's view model — what is currently open. `null` means the plain
 * nav bar. */
export type DockView =
  | { kind: "event"; event: CalendarEvent }
  | { kind: "edit"; event: CalendarEvent }
  | {
      kind: "create";
      startMs: number;
      endMs: number;
      prefill?: { summary?: string; description?: string };
    }
  | { kind: "search" }
  | { kind: "availability" }
  | { kind: "booking"; booking: Booking }
  | { kind: "settings"; section?: SettingsSection };

export type SettingsSection = "calendars" | "preferences";

function dockViewId(view: DockView): string {
  if (view.kind === "event") return `event:${view.event._id}`;
  if (view.kind === "edit") return `edit:${view.event._id}`;
  if (view.kind === "booking") return `booking:${view.booking._id}`;
  return view.kind;
}

function slideDirection(prev: DockView | null, next: DockView): number {
  if (prev?.kind !== "event" || next.kind !== "event") return 0;
  return Math.sign(next.event.startMs - prev.event.startMs);
}

type CreateSeed = { dayStartMs: number; events: CalendarEvent[] };

export type RevealInput = { startMs?: number; flashId: string };

interface DockContextValue {
  view: DockView | null;
  viewId: string | null;
  direction: number;
  open: (view: DockView) => void;
  close: () => void;
  registerCreateSeed: (seed: CreateSeed | null) => void;
  openCreate: () => void;
  registerReveal: (fn: ((input: RevealInput) => void) | null) => void;
  reveal: (input: RevealInput) => void;
  /** Read the user's stored preferences (used by children inside the dock). */
  preferences: UserPreferences;
}

const DockContext = createContext<DockContextValue | null>(null);

const DEFAULT_EVENT_DURATION_MS = 30 * 60 * 1000;

function nextFreeSlotFallback(
  dayStartMs: number,
  events: CalendarEvent[],
  nowMs: number,
): { startMs: number; endMs: number } {
  // Snap to next 30-min slot in the future, or 9am on days in the future.
  const nineAm = dayStartMs + 9 * 60 * 60 * 1000;
  const isToday = nowMs >= dayStartMs && nowMs < dayStartMs + 86400000;
  let startMs = isToday
    ? Math.max(nineAm, Math.ceil(nowMs / (30 * 60 * 1000)) * (30 * 60 * 1000))
    : nineAm;
  const lastStart = dayStartMs + 23 * 60 * 60 * 1000 - DEFAULT_EVENT_DURATION_MS;
  const timed = events
    .filter((e) => !e.allDay)
    .sort((a, b) => a.startMs - b.startMs);
  while (startMs <= lastStart) {
    const endMs = startMs + DEFAULT_EVENT_DURATION_MS;
    const clash = timed.find(
      (e) => e.startMs < endMs && e.endMs > startMs,
    );
    if (!clash) return { startMs, endMs };
    startMs = Math.max(
      startMs + 30 * 60 * 1000,
      Math.ceil(clash.endMs / (30 * 60 * 1000)) * (30 * 60 * 1000),
    );
  }
  return { startMs: lastStart, endMs: lastStart + DEFAULT_EVENT_DURATION_MS };
}

export function DockProvider({ children }: { children: ReactNode }) {
  const { state, setState } = useMocks();
  const preferences = useMyPreferences();
  const [state_view, setViewState] = useState<{
    view: DockView | null;
    direction: number;
  }>({ view: null, direction: 0 });

  const open = useCallback((next: DockView) => {
    setViewState((prev) => ({
      view: next,
      direction: slideDirection(prev.view, next),
    }));
  }, []);

  const close = useCallback(
    () => setViewState({ view: null, direction: 0 }),
    [],
  );

  const createSeedRef = useRef<CreateSeed | null>(null);
  const registerCreateSeed = useCallback((seed: CreateSeed | null) => {
    createSeedRef.current = seed;
  }, []);

  const openCreate = useCallback(() => {
    const seed = createSeedRef.current;
    const dayStartMs =
      seed?.dayStartMs ?? startOfDay(Date.now()).getTime();
    const range = nextFreeSlotFallback(
      dayStartMs,
      seed?.events ?? [],
      Date.now(),
    );
    open({ kind: "create", ...range });
  }, [open]);

  const revealRef = useRef<((input: RevealInput) => void) | null>(null);
  const registerReveal = useCallback(
    (fn: ((input: RevealInput) => void) | null) => {
      revealRef.current = fn;
    },
    [],
  );
  const reveal = useCallback((input: RevealInput) => {
    revealRef.current?.(input);
  }, []);

  const value = useMemo<DockContextValue>(
    () => ({
      view: state_view.view,
      viewId: state_view.view ? dockViewId(state_view.view) : null,
      direction: state_view.direction,
      open,
      close,
      registerCreateSeed,
      openCreate,
      registerReveal,
      reveal,
      preferences,
    }),
    [
      state_view,
      open,
      close,
      registerCreateSeed,
      openCreate,
      registerReveal,
      reveal,
      preferences,
    ],
  );

  return <DockContext value={value}>{children}</DockContext>;
}

export function useDock(): DockContextValue {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error("useDock must be used within a DockProvider");
  return ctx;
}
