import { Hono } from "hono"
import { z } from "zod"

import { db as defaultDb, type DbClient } from "@workspace/db"
import { listAvailableSlots } from "@workspace/db/queries/availability"
import { asStatus, errorBody } from "@/lib/responses"
import type { AppEnv } from "@/app"

/**
 * `GET /api/internal/availability?date=&service=`
 *
 * Returns the half-hour slots on the given date that are not already
 * held by a `pending` or `confirmed` booking. `service` is accepted
 * for forward compatibility (per-service durations land in a later
 * phase) but is currently unused.
 *
 * Auth: `requireInternalToken` on the parent namespace.
 */

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "date must be YYYY-MM-DD")

const querySchema = z.object({
  date: dateSchema,
  // `service` is a free-text slug; we validate length only so the
  // request stays bounded without committing to a service catalog.
  service: z.string().min(1).max(80).optional(),
})

export type AvailabilityRouteOptions = {
  db?: DbClient
  organizationId: string
}

export function makeAvailabilityRoute(options: AvailabilityRouteOptions) {
  const db = options.db ?? defaultDb
  const route = new Hono<{ Variables: AppEnv["Variables"] }>()

  route.get("/", async (c) => {
    const parsed = querySchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_QUERY",
          parsed.error.issues[0]?.message ?? "Invalid query parameters",
        ),
        asStatus(400),
      )
    }
    const slots = await listAvailableSlots(db, {
      organizationId: options.organizationId,
      date: parsed.data.date,
    })
    return c.json({
      date: parsed.data.date,
      slots,
    })
  })

  return route
}
