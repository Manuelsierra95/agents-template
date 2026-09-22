import { Hono, type Context } from "hono"
import { z } from "zod"

import { db as defaultDb, type DbClient } from "@workspace/db"
import {
  BatchMoveError,
  batchMoveEvents,
  createEvent,
  deleteEvent,
  getEventById,
  listEventsInRange,
  moveEvent,
  updateEvent,
} from "@workspace/db/queries/events"
import {
  BatchMoveEventsInputSchema,
  BatchMoveEventsResponseSchema,
  CalendarEventEnvelopeSchema,
  CalendarEventListSchema,
  CreateEventInputSchema,
  ListEventsQuerySchema,
  MoveEventInputSchema,
  UpdateEventInputSchema,
} from "@workspace/contracts/calendar"
import { publishRealtime } from "@/lib/realtime/publish"
import { asStatus, errorBody } from "@/lib/responses"
import type { AppEnv } from "@/app"

/**
 * `/api/calendar/events` — operator-facing CRUD for calendar entries
 * authored from the dashboard.
 *
 * Routes:
 *   - `GET    /`              — list events overlapping `[fromMs, toMs]`.
 *   - `GET    /:id`           — fetch one event (404 when not in the org).
 *   - `POST   /`              — create. The `created_by` column is taken
 *                                from the session user.
 *   - `POST   /batch-move`    — apply many drag-moves in one transaction.
 *   - `PATCH  /:id`           — partial update.
 *   - `PATCH  /:id/move`      — shortcut for `start_ms` / `end_ms`.
 *   - `DELETE /:id`           — hard delete.
 *
 * Auth: session-authenticated. `requireAuth` runs on the parent
 * `/api/calendar` namespace; every handler here reads
 * `c.var.auth.organizationId` for multi-tenant scoping and
 * `c.var.auth.user.id` for `created_by`.
 *
 * # Realtime
 *
 * Every successful write publishes an `event.created` /
 * `event.updated` / `event.deleted` realtime event via the in-process
 * bus (or Redis when `REDIS_URL` is set). Publishing is best-effort —
 * Postgres is the source of truth, and the SSE bridge in the UI
 * invalidates the React Query cache on receipt so other tabs converge
 * on the next refetch.
 */

const idSchema = z.string().uuid()

function serialize(event: {
  id: string
  organizationId: string
  createdBy: string | null
  summary: string
  description: string | null
  location: string | null
  startMs: number
  endMs: number
  allDay: boolean
  color: string | null
  status: "confirmed" | "cancelled"
  createdAt: Date | string
  updatedAt: Date | string
}) {
  return {
    id: event.id,
    organizationId: event.organizationId,
    createdBy: event.createdBy,
    summary: event.summary,
    description: event.description,
    location: event.location,
    startMs: event.startMs,
    endMs: event.endMs,
    allDay: event.allDay,
    color: event.color,
    status: event.status,
    createdAt:
      event.createdAt instanceof Date
        ? event.createdAt.toISOString()
        : String(event.createdAt),
    updatedAt:
      event.updatedAt instanceof Date
        ? event.updatedAt.toISOString()
        : String(event.updatedAt),
  }
}

export type CalendarEventsRouteOptions = {
  db?: DbClient
}

export function makeCalendarEventsRoute(
  options: CalendarEventsRouteOptions = {},
) {
  const db = options.db ?? defaultDb
  const route = new Hono<{ Variables: AppEnv["Variables"] }>()

  // `requireAuth` is applied by the parent `api/calendar` namespace;
  // this route assumes `c.var.auth` is populated. `requireSession`
  // returns the typed context or a pre-built 401 response so handlers
  // can `if (!session.ok) return session.response`.
  function requireSession(c: Context<{ Variables: AppEnv["Variables"] }>) {
    const auth = c.get("auth")
    if (!auth) {
      return {
        ok: false as const,
        response: c.json(
          errorBody("UNAUTHORIZED", "Authentication required."),
          asStatus(401),
        ),
      }
    }
    return { ok: true as const, auth }
  }

  // GET /
  route.get("/", async (c) => {
    const session = requireSession(c)
    if (!session.ok) return session.response

    const parsed = ListEventsQuerySchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_QUERY",
          parsed.error.issues[0]?.message ?? "Invalid query parameters",
        ),
        asStatus(400),
      )
    }
    if (parsed.data.toMs <= parsed.data.fromMs) {
      return c.json(
        errorBody("INVALID_RANGE", "toMs must be greater than fromMs"),
        asStatus(400),
      )
    }

    const rows = await listEventsInRange(db, {
      organizationId: session.auth.organizationId,
      fromMs: parsed.data.fromMs,
      toMs: parsed.data.toMs,
    })
    const payload = CalendarEventListSchema.parse({ events: rows.map(serialize) })
    return c.json(payload)
  })

  // GET /:id
  route.get("/:id", async (c) => {
    const session = requireSession(c)
    if (!session.ok) return session.response

    const idParse = idSchema.safeParse(c.req.param("id"))
    if (!idParse.success) {
      return c.json(
        errorBody("INVALID_EVENT_ID", "event id must be a UUID"),
        asStatus(400),
      )
    }

    const row = await getEventById(db, {
      organizationId: session.auth.organizationId,
      id: idParse.data,
    })
    if (!row) {
      return c.json(
        errorBody("EVENT_NOT_FOUND", `Event ${idParse.data} not found.`),
        asStatus(404),
      )
    }
    return c.json(CalendarEventEnvelopeSchema.parse({ event: serialize(row) }))
  })

  // POST /
  route.post("/", async (c) => {
    const session = requireSession(c)
    if (!session.ok) return session.response

    const body = await c.req.json().catch(() => null)
    const parsed = CreateEventInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_EVENT",
          parsed.error.issues[0]?.message ?? "Invalid event payload",
        ),
        asStatus(400),
      )
    }

    const row = await createEvent(db, {
      organizationId: session.auth.organizationId,
      createdBy: session.auth.user.id,
      summary: parsed.data.summary,
      startMs: parsed.data.startMs,
      endMs: parsed.data.endMs,
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.location !== undefined
        ? { location: parsed.data.location }
        : {}),
      ...(parsed.data.allDay !== undefined ? { allDay: parsed.data.allDay } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
    })

    await publishRealtime(c.get("eventBus"), {
      type: "event.created",
      organizationId: session.auth.organizationId,
      timestamp: new Date().toISOString(),
    })

    return c.json(CalendarEventEnvelopeSchema.parse({ event: serialize(row) }), asStatus(201))
  })

  // PATCH /:id
  route.patch("/:id", async (c) => {
    const session = requireSession(c)
    if (!session.ok) return session.response

    const idParse = idSchema.safeParse(c.req.param("id"))
    if (!idParse.success) {
      return c.json(
        errorBody("INVALID_EVENT_ID", "event id must be a UUID"),
        asStatus(400),
      )
    }

    const body = await c.req.json().catch(() => null)
    const parsed = UpdateEventInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_EVENT",
          parsed.error.issues[0]?.message ?? "Invalid event payload",
        ),
        asStatus(400),
      )
    }

    // Confirm the row exists in this org before patching — `updateEvent`
    // throws when nothing matches, which we want to surface as 404.
    const existing = await getEventById(db, {
      organizationId: session.auth.organizationId,
      id: idParse.data,
    })
    if (!existing) {
      return c.json(
        errorBody("EVENT_NOT_FOUND", `Event ${idParse.data} not found.`),
        asStatus(404),
      )
    }

    // If only one of startMs/endMs is patched, validate the combined
    // range against the existing row.
    const nextStart = parsed.data.startMs ?? existing.startMs
    const nextEnd = parsed.data.endMs ?? existing.endMs
    if (nextEnd <= nextStart) {
      return c.json(
        errorBody(
          "INVALID_EVENT",
          "endMs must be greater than startMs",
        ),
        asStatus(400),
      )
    }

    const updated = await updateEvent(db, {
      organizationId: session.auth.organizationId,
      id: idParse.data,
      patch: parsed.data,
    })

    await publishRealtime(c.get("eventBus"), {
      type: "event.updated",
      organizationId: session.auth.organizationId,
      timestamp: new Date().toISOString(),
    })

    return c.json(CalendarEventEnvelopeSchema.parse({ event: serialize(updated) }))
  })

  // POST /batch-move — drag-to-move burst. One transaction, one
  // realtime publish for the whole batch (clients reconcile their
  // pending queue from the returned `events`).
  route.post("/batch-move", async (c) => {
    const session = requireSession(c)
    if (!session.ok) return session.response

    const body = await c.req.json().catch(() => null)
    const parsed = BatchMoveEventsInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_BATCH",
          parsed.error.issues[0]?.message ?? "Invalid batch payload",
        ),
        asStatus(400),
      )
    }

    // Collapse duplicate ids — last write wins, in array order. The
    // query keeps the contract that the i-th entry was applied, but
    // the response only needs one row per id.
    const dedup = new Map<string, { id: string; startMs: number; endMs: number }>()
    for (const move of parsed.data.moves) {
      dedup.set(move.id, move)
    }
    const moves = [...dedup.values()]

    try {
      const updated = await batchMoveEvents(db, {
        organizationId: session.auth.organizationId,
        moves,
      })
      await publishRealtime(c.get("eventBus"), {
        type: "event.updated",
        organizationId: session.auth.organizationId,
        timestamp: new Date().toISOString(),
      })
      return c.json(
        BatchMoveEventsResponseSchema.parse({
          events: updated.map(serialize),
        }),
      )
    } catch (err) {
      if (err instanceof BatchMoveError) {
        // The transaction rolled back; tell the client nothing landed.
        const code =
          err.code === "EVENT_NOT_FOUND"
            ? "EVENT_NOT_FOUND"
            : "INVALID_BATCH"
        return c.json(errorBody(code, err.message), asStatus(404))
      }
      throw err
    }
  })

  // PATCH /:id/move — shortcut for drag-to-move.
  route.patch("/:id/move", async (c) => {
    const session = requireSession(c)
    if (!session.ok) return session.response

    const idParse = idSchema.safeParse(c.req.param("id"))
    if (!idParse.success) {
      return c.json(
        errorBody("INVALID_EVENT_ID", "event id must be a UUID"),
        asStatus(400),
      )
    }

    const body = await c.req.json().catch(() => null)
    const parsed = MoveEventInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_EVENT",
          parsed.error.issues[0]?.message ?? "Invalid move payload",
        ),
        asStatus(400),
      )
    }

    const updated = await moveEvent(db, {
      organizationId: session.auth.organizationId,
      id: idParse.data,
      startMs: parsed.data.startMs,
      endMs: parsed.data.endMs,
    })

    await publishRealtime(c.get("eventBus"), {
      type: "event.updated",
      organizationId: session.auth.organizationId,
      timestamp: new Date().toISOString(),
    })

    return c.json(CalendarEventEnvelopeSchema.parse({ event: serialize(updated) }))
  })

  // DELETE /:id
  route.delete("/:id", async (c) => {
    const session = requireSession(c)
    if (!session.ok) return session.response

    const idParse = idSchema.safeParse(c.req.param("id"))
    if (!idParse.success) {
      return c.json(
        errorBody("INVALID_EVENT_ID", "event id must be a UUID"),
        asStatus(400),
      )
    }

    // Read first so we can return a clean 404 when the row was already
    // gone (or never belonged to this org).
    const existing = await getEventById(db, {
      organizationId: session.auth.organizationId,
      id: idParse.data,
    })
    if (!existing) {
      return c.json(
        errorBody("EVENT_NOT_FOUND", `Event ${idParse.data} not found.`),
        asStatus(404),
      )
    }

    await deleteEvent(db, {
      organizationId: session.auth.organizationId,
      id: idParse.data,
    })

    await publishRealtime(c.get("eventBus"), {
      type: "event.deleted",
      organizationId: session.auth.organizationId,
      timestamp: new Date().toISOString(),
    })

    return c.body(null, asStatus(204))
  })

  return route
}
