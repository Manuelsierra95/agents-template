import { Hono } from "hono"
import { z } from "zod"

import {
  db as defaultDb,
  type DbClient,
} from "@workspace/db"
import {
  cancelBooking,
  createBooking,
  getBookingById,
  rescheduleBooking,
  upsertCustomerByPhone,
} from "@workspace/db/queries"
import { asStatus, errorBody } from "@/lib/responses"
import type { AppEnv } from "@/app"

/**
 * `/api/internal/bookings` — booking lifecycle endpoints used by the
 * agent's calendar tools.
 *
 * Routes:
 *   - `POST /`              — create a booking (`create_booking` tool).
 *   - `PATCH /:id/cancel`   — cancel a booking (`cancel_booking` tool).
 *   - `PATCH /:id/reschedule` — move a booking (`reschedule_booking` tool).
 *
 * Auth: `requireInternalToken` on the parent `api/internal` namespace.
 *
 * # Customer handling
 *
 * `create_booking` accepts the customer's phone (not an id) and
 * upserts a customer record by phone. The booking is then linked to
 * the resulting `customer.id`. This keeps the tool's contract simple
 * (one phone number in, one booking id out) and avoids a separate
 * customer-creation step on the agent's flow.
 */

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  time: z.string().regex(/^\d{2}:\d{2}$/u),
  service: z.string().min(1).max(80),
  customerPhone: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+?[0-9\s()-]+$/u),
  customerName: z.string().min(1).max(120).optional(),
  notes: z.string().max(500).optional(),
})

const idSchema = z.string().uuid()

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
})

const rescheduleSchema = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  newTime: z.string().regex(/^\d{2}:\d{2}$/u),
})

export type BookingRouteOptions = {
  db?: DbClient
  organizationId: string
}

export function makeBookingRoute(options: BookingRouteOptions) {
  const db = options.db ?? defaultDb
  const route = new Hono<{ Variables: AppEnv["Variables"] }>()

  // POST / — create
  route.post("/", async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_BOOKING",
          parsed.error.issues[0]?.message ?? "Invalid booking payload",
        ),
        asStatus(400),
      )
    }
    // Upsert the customer (idempotent on (org, phone)) and link the
    // booking to the resulting id.
    const customerName = parsed.data.customerName ?? parsed.data.customerPhone
    const customer = await upsertCustomerByPhone(db, {
      organizationId: options.organizationId,
      phone: parsed.data.customerPhone,
      name: customerName,
    })
    const booking = await createBooking(db, {
      organizationId: options.organizationId,
      customerId: customer.id,
      service: parsed.data.service,
      date: parsed.data.date,
      time: parsed.data.time,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    })
    return c.json(
      {
        bookingId: booking.id,
        date: booking.date,
        time: booking.time,
        status: booking.status,
        customerId: booking.customerId,
      },
      asStatus(201),
    )
  })

  // PATCH /:id/cancel
  route.patch("/:id/cancel", async (c) => {
    const idParse = idSchema.safeParse(c.req.param("id"))
    if (!idParse.success) {
      return c.json(
        errorBody("INVALID_BOOKING_ID", "booking id must be a UUID"),
        asStatus(400),
      )
    }
    const body = await c.req.json().catch(() => ({}))
    const parsed = cancelSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_CANCEL",
          parsed.error.issues[0]?.message ?? "Invalid cancel payload",
        ),
        asStatus(400),
      )
    }
    const cancelled = await cancelBooking(db, {
      organizationId: options.organizationId,
      id: idParse.data,
      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    })
    return c.json({
      bookingId: cancelled.id,
      status: cancelled.status,
    })
  })

  // PATCH /:id/reschedule
  route.patch("/:id/reschedule", async (c) => {
    const idParse = idSchema.safeParse(c.req.param("id"))
    if (!idParse.success) {
      return c.json(
        errorBody("INVALID_BOOKING_ID", "booking id must be a UUID"),
        asStatus(400),
      )
    }
    const body = await c.req.json().catch(() => null)
    const parsed = rescheduleSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_RESCHEDULE",
          parsed.error.issues[0]?.message ?? "Invalid reschedule payload",
        ),
        asStatus(400),
      )
    }
    // Ensure the booking exists in this org (otherwise reschedule
    // would silently insert a new row on a future RETURNING; we want
    // an explicit 404 instead).
    const existing = await getBookingById(db, {
      organizationId: options.organizationId,
      id: idParse.data,
    })
    if (!existing) {
      return c.json(
        errorBody(
          "BOOKING_NOT_FOUND",
          `Booking ${idParse.data} not found.`,
        ),
        asStatus(404),
      )
    }
    const updated = await rescheduleBooking(db, {
      organizationId: options.organizationId,
      id: idParse.data,
      newDate: parsed.data.newDate,
      newTime: parsed.data.newTime,
    })
    return c.json({
      bookingId: updated.id,
      newDate: updated.date,
      newTime: updated.time,
      status: updated.status,
    })
  })

  return route
}
