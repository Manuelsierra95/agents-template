"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  advance,
  beginSession,
  commitRange,
  type GridDragMode,
  type GridDragRange,
  type GridDragSession,
  ownsPointer,
} from "./grid-drag";

interface GridDragPreview extends GridDragRange {
  mode: GridDragMode;
}

interface BeginGridDragOptions {
  mode: GridDragMode;
  dayStartMs: number;
  columnEl: HTMLElement;
  e: React.PointerEvent;
}

interface UseGridDrag {
  preview: GridDragPreview | null;
  begin: (options: BeginGridDragOptions) => void;
}

export function useGridDrag(
  onCommit: (mode: GridDragMode, range: GridDragRange) => void,
): UseGridDrag {
  const [preview, setPreview] = useState<GridDragPreview | null>(null);
  const sessionRef = useRef<GridDragSession | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });

  const endSession = useCallback(() => {
    const session = sessionRef.current;
    const el = elRef.current;
    if (session && el) {
      try {
        el.releasePointerCapture(session.pointerId);
      } catch {
        /* noop */
      }
    }
    sessionRef.current = null;
    elRef.current = null;
    setPreview(null);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const session = sessionRef.current;
    if (!ownsPointer(session, e.pointerId)) return;
    const wasMoved = session.moved;
    const range = advance(session, e.clientX, e.clientY);
    if (!range) return;
    if (!wasMoved) {
      try {
        elRef.current?.setPointerCapture(session.pointerId);
      } catch {
        /* noop */
      }
    }
    setPreview({ mode: session.mode, ...range });
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!ownsPointer(session, e.pointerId)) return;
      const range = commitRange(session);
      const mode = session.mode;
      endSession();
      if (range) commitRef.current(mode, range);
    },
    [endSession],
  );

  const onPointerCancel = useCallback(
    (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!ownsPointer(session, e.pointerId)) return;
      endSession();
    },
    [endSession],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!sessionRef.current) return;
      endSession();
    },
    [endSession],
  );

  const begin = useCallback(
    ({ mode, dayStartMs, columnEl, e }: BeginGridDragOptions) => {
      if (e.button !== 0) return;
      if (sessionRef.current) return;
      const rect = columnEl.getBoundingClientRect();
      sessionRef.current = beginSession({
        pointerId: e.pointerId,
        mode,
        dayStartMs,
        columnTop: rect.top,
        columnHeight: rect.height,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      elRef.current = columnEl;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("keydown", onKeyDown);
    },
    [onPointerMove, onPointerUp, onPointerCancel, onKeyDown],
  );

  useEffect(() => endSession, [endSession]);

  return { preview, begin };
}
