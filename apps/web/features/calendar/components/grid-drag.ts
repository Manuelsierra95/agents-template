import { MS_PER_DAY, SNAP_MS, snappedMsFromOffsetY } from "./lib";

export type GridDragMode = "create" | "paint";

const GRID_DRAG_THRESHOLD_PX = 4;

export interface GridDragRange {
  startMs: number;
  endMs: number;
}

export interface GridDragSession extends GridDragRange {
  pointerId: number;
  mode: GridDragMode;
  dayStartMs: number;
  dayEndMs: number;
  columnTop: number;
  columnHeight: number;
  anchorMs: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

interface BeginSessionInput {
  pointerId: number;
  mode: GridDragMode;
  dayStartMs: number;
  columnTop: number;
  columnHeight: number;
  clientX: number;
  clientY: number;
}

export function beginSession({
  pointerId,
  mode,
  dayStartMs,
  columnTop,
  columnHeight,
  clientX,
  clientY,
}: BeginSessionInput): GridDragSession {
  const dayEndMs = dayStartMs + MS_PER_DAY;
  const height = columnHeight || 1;
  const anchorMs = Math.min(
    snappedMsFromOffsetY(clientY - columnTop, dayStartMs, height),
    dayEndMs - SNAP_MS,
  );
  return {
    pointerId,
    mode,
    dayStartMs,
    dayEndMs,
    columnTop,
    columnHeight: height,
    anchorMs,
    startClientX: clientX,
    startClientY: clientY,
    moved: false,
    startMs: anchorMs,
    endMs: anchorMs + SNAP_MS,
  };
}

export function advance(
  session: GridDragSession,
  clientX: number,
  clientY: number,
): GridDragRange | null {
  if (!session.moved) {
    if (
      Math.abs(clientX - session.startClientX) < GRID_DRAG_THRESHOLD_PX &&
      Math.abs(clientY - session.startClientY) < GRID_DRAG_THRESHOLD_PX
    ) {
      return null;
    }
    session.moved = true;
  }
  const cursorMs = snappedMsFromOffsetY(
    clientY - session.columnTop,
    session.dayStartMs,
    session.columnHeight,
  );
  const startMs = Math.min(session.anchorMs, cursorMs);
  const endMs = Math.min(
    Math.max(Math.max(session.anchorMs, cursorMs), startMs + SNAP_MS),
    session.dayEndMs,
  );
  session.startMs = startMs;
  session.endMs = endMs;
  return { startMs, endMs };
}

export function commitRange(session: GridDragSession): GridDragRange | null {
  if (!session.moved) return null;
  if (session.endMs <= session.startMs) return null;
  return { startMs: session.startMs, endMs: session.endMs };
}

export function ownsPointer(
  session: GridDragSession | null,
  pointerId: number,
): session is GridDragSession {
  return session !== null && session.pointerId === pointerId;
}
