import { and, eq, gte, lte } from "drizzle-orm"

import type { DbClient } from "@workspace/db"
import { booking, bookingStatus } from "@workspace/db/schema/bookings"
import type {
  Booking,
  BookingStatus,
  NewBooking,
} from "@workspace/db/schema/bookings"

/**
 * Booking queries. Multi-tenant via `organizationId` everywhere.
 */

/**
 * Insert a new booking in `pending` status.
 *
 * `date` is `YYYY-MM-DD`; `time` is `HH:mm`. Validation against the
 * `BookingDate` / `BookingTime` regexes is the API layer's job —
 * by the time we reach this query the values are well-formed strings.
 */
export async function createBooking(
  db: DbClient,
  args: {
    organizationId: string
    customerId: string
    service: string
    date: string
    time: string
    notes?: string
  },
): Promise<Booking> {
  const row: NewBooking = {
    organizationId: args.organizationId,
    customerId: args.customerId,
    service: args.service,
    date: args.date,
    time: args.time,
    status: "pending",
    ...(args.notes ? { notes: args.notes } : {}),
  }
  const inserted = await db.insert(booking).values(row).returning()
  const created = inserted[0]
  if (!created) {
    throw new Error("createBooking: insert returned no rows")
  }
  return created
}

export async function getBookingById(
  db: DbClient,
  args: { organizationId: string; id: string },
): Promise<Booking | undefined> {
  const rows = await db
    .select()
    .from(booking)
    .where(and(eq(booking.id, args.id), eq(booking.organizationId, args.organizationId)))
    .limit(1)
  return rows[0]
}

export async function listBookingsForDay(
  db: DbClient,
  args: { organizationId: string; date: string },
): Promise<Booking[]> {
  // "pending" and "confirmed" both occupy the slot; cancelled/rescheduled/
  // completed do not. We keep the slot list narrow so the agent's
  // check_availability returns only what is genuinely held.
  const rows = await db
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.organizationId, args.organizationId),
        eq(booking.date, args.date),
      ),
    )
  return rows.filter((b) => b.status === "pending" || b.status === "confirmed")
}

export async function listBookingsForCustomer(
  db: DbClient,
  args: { organizationId: string; customerId: string; fromDate?: string; toDate?: string },
): Promise<Booking[]> {
  const conds = [
    eq(booking.organizationId, args.organizationId),
    eq(booking.customerId, args.customerId),
  ]
  if (args.fromDate) conds.push(gte(booking.date, args.fromDate))
  if (args.toDate) conds.push(lte(booking.date, args.toDate))
  return db
    .select()
    .from(booking)
    .where(and(...conds))
}

/**
 * Move a booking to a new date/time and mark it `rescheduled`.
 *
 * We do NOT delete the row — the historical record stays in the DB
 * with `status = rescheduled` and a fresh row is inserted for the new
 * slot. This keeps the timeline queryable.
 */
export async function rescheduleBooking(
  db: DbClient,
  args: {
    organizationId: string
    id: string
    newDate: string
    newTime: string
  },
): Promise<Booking> {
  // First mark the old booking as `rescheduled`.
  const updated = await db
    .update(booking)
    .set({ status: "rescheduled", updatedAt: new Date() })
    .where(and(eq(booking.id, args.id), eq(booking.organizationId, args.organizationId)))
    .returning()
  if (updated.length === 0) {
    throw new Error(
      `rescheduleBooking: booking ${args.id} not found in organization ${args.organizationId}`,
    )
  }
  const old = updated[0]
  if (!old) {
    throw new Error("rescheduleBooking: row vanished after update")
  }
  // Insert a fresh row for the new slot. The link between the old and
  // the new is via the customer + the original `createdAt` ordering.
  const inserted = await db
    .insert(booking)
    .values({
      organizationId: old.organizationId,
      customerId: old.customerId,
      service: old.service,
      date: args.newDate,
      time: args.newTime,
      status: "confirmed",
      notes: old.notes ?? null,
    })
    .returning()
  const created = inserted[0]
  if (!created) {
    throw new Error("rescheduleBooking: insert returned no rows")
  }
  return created
}

/**
 * Cancel a booking.
 *
 * Idempotent: cancelling an already-cancelled booking is a no-op
 * (returns the existing row). Caller can detect "already cancelled"
 * via the returned `status`.
 */
export async function cancelBooking(
  db: DbClient,
  args: { organizationId: string; id: string; reason?: string },
): Promise<Booking> {
  // Read first so we can return the row even when nothing changes.
  const existing = await getBookingById(db, args)
  if (!existing) {
    throw new Error(
      `cancelBooking: booking ${args.id} not found in organization ${args.organizationId}`,
    )
  }
  if (existing.status === "cancelled") {
    return existing
  }
  const updateValues: Partial<NewBooking> = {
    status: "cancelled",
    updatedAt: new Date(),
  }
  if (args.reason) {
    const existingNotes = existing.notes ?? ""
    updateValues.notes = existingNotes
      ? `${existingNotes}\n[cancelled] ${args.reason}`
      : `[cancelled] ${args.reason}`
  }
  const updated = await db
    .update(booking)
    .set(updateValues)
    .where(and(eq(booking.id, args.id), eq(booking.organizationId, args.organizationId)))
    .returning()
  const result = updated[0]
  if (!result) {
    throw new Error("cancelBooking: row vanished after update")
  }
  return result
}

/**
 * Re-export the booking status enum so callers can use the typed
 * list without importing the schema directly.
 */
export { bookingStatus }
export type { BookingStatus }
