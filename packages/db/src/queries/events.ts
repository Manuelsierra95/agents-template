import { and, eq, gte, lte, sql } from "drizzle-orm"

import type { DbClient } from "@workspace/db"
import {
  calendarEvent,
  calendarEventStatus,
} from "@workspace/db/schema/events"
import type {
  CalendarEvent,
  CalendarEventStatus,
  NewCalendarEvent,
} from "@workspace/db/schema/events"

/**
 * Calendar-event queries. Multi-tenant via `organizationId` everywhere.
 *
 * The dashboard reads / writes through these helpers; the API layer
 * validates inputs first so the queries can trust their arguments.
 *
 * `cancelled` rows are returned by the range query (the UI renders them
 * with reduced opacity) but never by `getEventById` callers that want a
 * "live" event — they call `getActiveEventById` instead.
 */

/**
 * Insert a new event in `confirmed` status. `createdBy` is the
 * Better Auth `user.id` of the operator.
 */
export async function createEvent(
  db: DbClient,
  args: {
    organizationId: string
    createdBy: string | null
    summary: string
    description?: string | null
    location?: string | null
    startMs: number
    endMs: number
    allDay?: boolean
    color?: string | null
  },
): Promise<CalendarEvent> {
  const row: NewCalendarEvent = {
    organizationId: args.organizationId,
    createdBy: args.createdBy,
    summary: args.summary,
    startMs: args.startMs,
    endMs: args.endMs,
    status: "confirmed",
    ...(args.description !== undefined ? { description: args.description } : {}),
    ...(args.location !== undefined ? { location: args.location } : {}),
    ...(args.allDay !== undefined ? { allDay: args.allDay } : {}),
    ...(args.color !== undefined ? { color: args.color } : {}),
  }
  const inserted = await db.insert(calendarEvent).values(row).returning()
  const created = inserted[0]
  if (!created) {
    throw new Error("createEvent: insert returned no rows")
  }
  return created
}

/**
 * Fetch one event by id within the org scope.
 *
 * Returns the row regardless of status; callers that only want live
 * events should filter downstream.
 */
export async function getEventById(
  db: DbClient,
  args: { organizationId: string; id: string },
): Promise<CalendarEvent | undefined> {
  const rows = await db
    .select()
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.id, args.id),
        eq(calendarEvent.organizationId, args.organizationId),
      ),
    )
    .limit(1)
  return rows[0]
}

/**
 * Range overlap: any event whose `[startMs, endMs]` intersects
 * `[fromMs, toMs]`. Used by the calendar grid to load everything visible
 * in the current view.
 *
 * Index used: `calendar_event_org_start_idx (organization_id, start_ms)`.
 * Postgres still needs to filter on `end_ms`, but the org+start prefix
 * keeps the scan cheap.
 */
export async function listEventsInRange(
  db: DbClient,
  args: {
    organizationId: string
    fromMs: number
    toMs: number
    limit?: number
  },
): Promise<CalendarEvent[]> {
  return db
    .select()
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.organizationId, args.organizationId),
        sql`${calendarEvent.startMs} <= ${args.toMs}`,
        sql`${calendarEvent.endMs} >= ${args.fromMs}`,
      ),
    )
    .orderBy(calendarEvent.startMs)
    .limit(args.limit ?? 1000)
}

/**
 * Patch a subset of the event's mutable fields. `undefined` keys are
 * ignored (the existing value is preserved). Always stamps `updatedAt`.
 *
 * Throws when the row is missing in the org scope — the API layer
 * surfaces that as 404.
 */
export async function updateEvent(
  db: DbClient,
  args: {
    organizationId: string
    id: string
    patch: {
      summary?: string
      description?: string | null
      location?: string | null
      startMs?: number
      endMs?: number
      allDay?: boolean
      color?: string | null
      status?: CalendarEventStatus
    }
  },
): Promise<CalendarEvent> {
  const updateValues: Partial<NewCalendarEvent> = {
    updatedAt: new Date(),
  }
  const p = args.patch
  if (p.summary !== undefined) updateValues.summary = p.summary
  if (p.description !== undefined) updateValues.description = p.description
  if (p.location !== undefined) updateValues.location = p.location
  if (p.startMs !== undefined) updateValues.startMs = p.startMs
  if (p.endMs !== undefined) updateValues.endMs = p.endMs
  if (p.allDay !== undefined) updateValues.allDay = p.allDay
  if (p.color !== undefined) updateValues.color = p.color
  if (p.status !== undefined) updateValues.status = p.status

  const updated = await db
    .update(calendarEvent)
    .set(updateValues)
    .where(
      and(
        eq(calendarEvent.id, args.id),
        eq(calendarEvent.organizationId, args.organizationId),
      ),
    )
    .returning()
  const row = updated[0]
  if (!row) {
    throw new Error(
      `updateEvent: event ${args.id} not found in organization ${args.organizationId}`,
    )
  }
  return row
}

/**
 * Drag-to-move shortcut. Equivalent to `updateEvent({ startMs, endMs })`
 * but reads as one intent at the call site.
 */
export async function moveEvent(
  db: DbClient,
  args: {
    organizationId: string
    id: string
    startMs: number
    endMs: number
  },
): Promise<CalendarEvent> {
  return updateEvent(db, {
    organizationId: args.organizationId,
    id: args.id,
    patch: { startMs: args.startMs, endMs: args.endMs },
  })
}

/**
 * Hard delete. The history is lost — the table is the source of truth
 * (no soft delete column yet). If the dashboard ever needs "undo" we
 * can flip this to a soft delete; for now, deletes are destructive on
 * purpose to match the mock's behaviour.
 */
export async function deleteEvent(
  db: DbClient,
  args: { organizationId: string; id: string },
): Promise<void> {
  await db
    .delete(calendarEvent)
    .where(
      and(
        eq(calendarEvent.id, args.id),
        eq(calendarEvent.organizationId, args.organizationId),
      ),
    )
}

/**
 * `batchMoveEvents` — apply several `startMs` / `endMs` updates in a
 * single transaction.
 *
 * The dashboard's drag-to-move flow lets the operator rearrange many
 * events in quick succession (drag a card across columns, then another).
 * Per-event HTTP round-trips would each incur a full Postgres write and
 * a separate realtime publish, which adds up to visible lag and floods
 * the SSE bridge. Batching collapses it to one round-trip and one
 * publish per "burst" of moves.
 *
 * Validation strategy:
 *   - Per move: `endMs > startMs` (already enforced by the Zod input).
 *   - Per move: the row must already exist in this org (FK + scope).
 *     If any row is missing, the *entire* batch rolls back — atomicity
 *     matches the UI's expectation that a partial move never lands.
 *   - The batch is a no-op when `moves.length === 0` (the route handler
 *     guards against that case; the query keeps the same contract).
 *
 * On any per-row `update` returning no rows we throw; Drizzle's
 * `db.transaction` wrapper catches it and rolls back the previous
 * statements, so the caller sees a single `BatchMoveError`.
 */
export class BatchMoveError extends Error {
  readonly code: "EVENT_NOT_FOUND" | "CROSS_ORG_FORBIDDEN"
  constructor(code: BatchMoveError["code"], message: string) {
    super(message)
    this.code = code
  }
}

export async function batchMoveEvents(
  db: DbClient,
  args: {
    organizationId: string
    moves: { id: string; startMs: number; endMs: number }[]
  },
): Promise<CalendarEvent[]> {
  if (args.moves.length === 0) return []

  return db.transaction(async (tx) => {
    const updated: CalendarEvent[] = []
    const now = new Date()
    for (const move of args.moves) {
      const result = await tx
        .update(calendarEvent)
        .set({
          startMs: move.startMs,
          endMs: move.endMs,
          updatedAt: now,
        })
        .where(
          and(
            eq(calendarEvent.id, move.id),
            eq(calendarEvent.organizationId, args.organizationId),
          ),
        )
        .returning()
      const row = result[0]
      if (!row) {
        throw new BatchMoveError(
          "EVENT_NOT_FOUND",
          `Event ${move.id} not found in organization ${args.organizationId}`,
        )
      }
      updated.push(row)
    }
    return updated
  })
}

/**
 * Future range helpers — kept here so the API can compose them.
 * Currently unused; safe to import when a query needs them.
 */
export async function listEventsAfter(
  db: DbClient,
  args: { organizationId: string; fromMs: number; limit?: number },
): Promise<CalendarEvent[]> {
  return db
    .select()
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.organizationId, args.organizationId),
        gte(calendarEvent.startMs, args.fromMs),
      ),
    )
    .orderBy(calendarEvent.startMs)
    .limit(args.limit ?? 1000)
}

export async function listEventsBefore(
  db: DbClient,
  args: { organizationId: string; toMs: number; limit?: number },
): Promise<CalendarEvent[]> {
  return db
    .select()
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.organizationId, args.organizationId),
        lte(calendarEvent.endMs, args.toMs),
      ),
    )
    .orderBy(calendarEvent.startMs)
    .limit(args.limit ?? 1000)
}

/**
 * Re-export the status enum so callers can use the typed list without
 * importing the schema directly.
 */
export { calendarEventStatus }
export type { CalendarEventStatus }
