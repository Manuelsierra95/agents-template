"use client";

import { startOfDay } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type CalendarEvent,
  MS_PER_DAY,
  SNAP_MS,
  zoned,
} from "./lib";
import { useEventCapabilities } from "./permissions";

import { usePendingMoves } from "../hooks/use-pending-moves";
import { useDock } from "../workspace/dock-context";

export type DragMode = "move" | "resize-start" | "resize-end";

const DRAG_THRESHOLD_PX = 4;

const PENDING_TIMEOUT_MS = 10_000;

interface OverrideTimes {
  startMs: number;
  endMs: number;
}

interface DragSession {
  event: CalendarEvent;
  mode: DragMode;
  gridEl: HTMLElement;
  el: HTMLElement;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  grabOffsetMs: number;
  durationMs: number;
  moved: boolean;
  readOnly: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

function snap(ms: number, dayStartMs: number): number {
  return dayStartMs + Math.round((ms - dayStartMs) / SNAP_MS) * SNAP_MS;
}

interface UseEventDrag {
  effectiveEvents: CalendarEvent[];
  beginDrag: (
    event: CalendarEvent,
    mode: DragMode,
    e: React.PointerEvent,
    gridEl: HTMLElement | null,
  ) => void;
  draggingId: string | null;
}

export function useEventDrag(
  events: CalendarEvent[],
  days: Date[],
  timeZone: string,
): UseEventDrag {
  const { moveEvent } = usePendingMoves();
  const { open } = useDock();

  const [overrides, setOverrides] = useState<Record<string, OverrideTimes>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sessionRef = useRef<DragSession | null>(null);
  const daysRef = useRef(days);
  daysRef.current = days;
  const tzRef = useRef(timeZone);
  tzRef.current = timeZone;
  const capabilitiesOf = useEventCapabilities();

  const effectiveEvents = useMemo(() => {
    if (Object.keys(overrides).length === 0) return events;
    return events.map((event) => {
      const o = overrides[event.id];
      return o ? { ...event, startMs: o.startMs, endMs: o.endMs } : event;
    });
  }, [events, overrides]);

  useEffect(() => {
    const byId = new Map<string, CalendarEvent>(events.map((e) => [e.id, e]));
    setOverrides((prev) => {
      let next = prev;
      for (const id of Object.keys(next)) {
        if (!byId.has(id)) delete next[id];
      }
      return next;
    });
  }, [events]);

  const endSession = useCallback(() => {
    const s = sessionRef.current;
    if (s) {
      try {
        s.el.releasePointerCapture(s.pointerId);
      } catch {
        /* noop */
      }
    }
    sessionRef.current = null;
    setDraggingId(null);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerCancel = useCallback(
    (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      setOverrides((prev) => {
        if (!prev[s.event.id]) return prev;
        const next = { ...prev };
        delete next[s.event.id];
        return next;
      });
      endSession();
    },
    [endSession],
  );

  const computeTimes = useCallback(
    (s: DragSession, clientX: number, clientY: number): OverrideTimes => {
      const rect = s.gridEl.getBoundingClientRect();
      const height = rect.height || 1;
      const msPerPx = MS_PER_DAY / height;
      const origStart = s.event.startMs;

      if (s.mode === "move") {
        const cols = daysRef.current.length;
        const colWidth = rect.width / cols;
        const idx = clamp(
          Math.floor((clientX - rect.left) / colWidth),
          0,
          cols - 1,
        );
        const dayRef = daysRef.current[idx];
        if (!dayRef) {
          return {
            startMs: s.event.startMs,
            endMs: s.event.endMs,
          };
        }
        const dayStart = dayRef.getTime();
        const dayEnd = dayStart + MS_PER_DAY;
        const rawPointer = dayStart + (clientY - rect.top) * msPerPx;
        const startMs = clamp(
          snap(rawPointer - s.grabOffsetMs, dayStart),
          dayStart,
          dayEnd - s.durationMs,
        );
        return { startMs, endMs: startMs + s.durationMs };
      }

      const dayStart = startOfDay(zoned(origStart, tzRef.current)).getTime();
      const dayEnd = dayStart + MS_PER_DAY;
      const rawPointer = dayStart + (clientY - rect.top) * msPerPx;
      const pointer = clamp(snap(rawPointer, dayStart), dayStart, dayEnd);
      if (s.mode === "resize-start") {
        const startMs = Math.min(pointer, s.event.endMs - SNAP_MS);
        return { startMs, endMs: s.event.endMs };
      }
      const endMs = Math.max(pointer, origStart + SNAP_MS);
      return { startMs: origStart, endMs };
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      if (s.readOnly) return;
      if (!s.moved) {
        if (
          Math.abs(e.clientX - s.startClientX) < DRAG_THRESHOLD_PX &&
          Math.abs(e.clientY - s.startClientY) < DRAG_THRESHOLD_PX
        ) {
          return;
        }
        s.moved = true;
        try {
          s.el.setPointerCapture(s.pointerId);
        } catch {
          /* noop */
        }
        setDraggingId(s.event.id);
      }
      const times = computeTimes(s, e.clientX, e.clientY);
      setOverrides((prev) => ({ ...prev, [s.event.id]: times }));
    },
    [computeTimes],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      if (!s.moved) {
        // A press that never became a drag — anywhere on the card, edges
        // included — opens the event detail in the dock.
        open({ kind: "event", event: s.event });
        endSession();
        return;
      }
      const times = computeTimes(s, e.clientX, e.clientY);
      const id = s.event.id;
      const unchanged =
        times.startMs === s.event.startMs && times.endMs === s.event.endMs;
      if (unchanged) {
      setOverrides((prev) => {
        if (!prev[s.event.id]) return prev;
        const next = { ...prev };
        delete next[s.event.id];
        return next;
      });
      } else {
        setOverrides((prev) => ({ ...prev, [id]: times }));
        moveEvent(id, times.startMs, times.endMs);
        // Don't clear the override here: `moveEvent` enqueues into the
        // debounced batch queue (`usePendingMoves`) and the React
        // Query cache only catches up once the batch flushes + the SSE
        // `event.updated` invalidates `eventsKeys.all`. Keeping the
        // override means the card stays pinned to its new position
        // through that whole round-trip. The `useEffect` above prunes
        // overrides for events that disappear from the cache; for
        // events that simply update their `startMs`/`endMs`, the
        // override remains a redundant copy of the same value (no
        // visual diff).
      }
      endSession();
    },
    [computeTimes, moveEvent, open, endSession],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = sessionRef.current;
      if (!s) return;
      setOverrides((prev) => {
        if (!prev[s.event.id]) return prev;
        const next = { ...prev };
        delete next[s.event.id];
        return next;
      });
      endSession();
    },
    [endSession],
  );

  const beginDrag = useCallback(
    (
      event: CalendarEvent,
      mode: DragMode,
      e: React.PointerEvent,
      gridEl: HTMLElement | null,
    ) => {
      if (e.button !== 0 || !gridEl) return;
      const cardRect = e.currentTarget.getBoundingClientRect();
      const gridRect = gridEl.getBoundingClientRect();
      const msPerPx = MS_PER_DAY / (gridRect.height || 1);
      sessionRef.current = {
        event,
        mode,
        gridEl,
        el: e.currentTarget as HTMLElement,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        grabOffsetMs: (e.clientY - cardRect.top) * msPerPx,
        durationMs: Math.max(event.endMs - event.startMs, SNAP_MS),
        moved: false,
        readOnly: !capabilitiesOf(event).canEdit,
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("keydown", onKeyDown);
    },
    [onPointerMove, onPointerUp, onPointerCancel, onKeyDown, capabilitiesOf],
  );

  // Safety purge of the pending timer map (mock-flavor of the template's
  // background reconciliation).
  useEffect(
    () => () => {
      /* noop */
    },
    [],
  );

  return { effectiveEvents, beginDrag, draggingId };
}
