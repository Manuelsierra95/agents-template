/**
 * DB-query integration tests for the calendar + conversations layer
 * introduced in Phase 2D. Connects to `DATABASE_URL_TEST` (the docker
 * compose dev DB) and truncates every relevant table in `beforeEach`
 * so the assertions start from a clean slate.
 *
 * We skip the entire suite when `DATABASE_URL_TEST` is unset so CI
 * runs without a DB still pass.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createDbHandle, type DbHandle } from "@workspace/db"
import {
  cancelBooking,
  createBooking,
  getBookingById,
  listBookingsForCustomer,
  listBookingsForDay,
  rescheduleBooking,
} from "@workspace/db/queries/bookings"
import { listAvailableSlots } from "@workspace/db/queries/availability"
import {
  getCustomerById,
  getCustomerByPhone,
  upsertCustomerByPhone,
} from "@workspace/db/queries/customers"
import {
  BatchMoveError,
  batchMoveEvents,
  createEvent,
  getEventById,
} from "@workspace/db/queries/events"
import {
  appendMessageAndTouchConversation,
  findOrCreateConversation,
  getConversationById,
  listMessages,
} from "@workspace/db/queries/conversations"

import { resetDb, seedOrg } from "./helpers/db.ts"

const TEST_DB = process.env.DATABASE_URL_TEST

const skipIfNoDb = TEST_DB ? describe : describe.skip

skipIfNoDb("db queries (Phase 2D)", () => {
  let handle: DbHandle
  const ORG = "00000000-0000-0000-0000-000000000001"

  beforeAll(async () => {
    handle = createDbHandle(TEST_DB!)
  })

  afterAll(async () => {
    await handle.close()
  })

  beforeEach(async () => {
    await resetDb(handle)
  })

  describe("customers", () => {
    it("upserts by phone within an org (no duplicates on second upsert)", async () => {
      const a = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000000",
        name: "Ana",
      })
      const b = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000000",
        name: "Ana Actualizada",
      })
      expect(a.id).toBe(b.id)
      expect(b.name).toBe("Ana") // first call wins
    })

    it("getCustomerByPhone returns undefined when missing", async () => {
      const got = await getCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34000000000",
      })
      expect(got).toBeUndefined()
    })

    it("scopes by organizationId (same phone, different orgs → two rows)", async () => {
      const a = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000000",
        name: "A",
      })
      const OTHER_ORG = "00000000-0000-0000-0000-000000000002"
      // Seed the second org so the FK is satisfied.
      await seedOrg(handle, OTHER_ORG)
      const b = await upsertCustomerByPhone(handle.db, {
        organizationId: OTHER_ORG,
        phone: "+34600000000",
        name: "B",
      })
      expect(b.organizationId).toBe(OTHER_ORG)
      // The original row is untouched and remains scoped to ORG.
      const aReloaded = await getCustomerById(handle.db, {
        organizationId: ORG,
        id: a.id,
      })
      expect(aReloaded?.organizationId).toBe(ORG)
      expect(aReloaded?.name).toBe("A")
    })
  })

  describe("bookings", () => {
    it("creates a booking and reads it back by id", async () => {
      const customer = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000000",
        name: "Ana",
      })
      const created = await createBooking(handle.db, {
        organizationId: ORG,
        customerId: customer.id,
        service: "corte",
        date: "2025-01-15",
        time: "10:00",
      })
      const found = await getBookingById(handle.db, {
        organizationId: ORG,
        id: created.id,
      })
      expect(found?.id).toBe(created.id)
      expect(found?.status).toBe("pending")
    })

    it("cancels a booking (idempotent on second cancel)", async () => {
      const c = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000000",
        name: "Ana",
      })
      const b = await createBooking(handle.db, {
        organizationId: ORG,
        customerId: c.id,
        service: "corte",
        date: "2025-01-15",
        time: "10:00",
      })
      const first = await cancelBooking(handle.db, {
        organizationId: ORG,
        id: b.id,
      })
      expect(first.status).toBe("cancelled")
      const second = await cancelBooking(handle.db, {
        organizationId: ORG,
        id: b.id,
      })
      expect(second.status).toBe("cancelled")
    })

    it("reschedules by inserting a new row and marking the old one rescheduled", async () => {
      const c = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000000",
        name: "Ana",
      })
      const original = await createBooking(handle.db, {
        organizationId: ORG,
        customerId: c.id,
        service: "corte",
        date: "2025-01-15",
        time: "10:00",
      })
      const updated = await rescheduleBooking(handle.db, {
        organizationId: ORG,
        id: original.id,
        newDate: "2025-01-16",
        newTime: "11:00",
      })
      expect(updated.id).not.toBe(original.id)
      expect(updated.date).toBe("2025-01-16")
      // The old row is preserved with `status = rescheduled`.
      const old = await getBookingById(handle.db, {
        organizationId: ORG,
        id: original.id,
      })
      expect(old?.status).toBe("rescheduled")
    })

    it("listBookingsForDay filters out cancelled/rescheduled rows", async () => {
      const c = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000000",
        name: "Ana",
      })
      await createBooking(handle.db, {
        organizationId: ORG,
        customerId: c.id,
        service: "corte",
        date: "2025-01-15",
        time: "10:00",
      })
      const second = await createBooking(handle.db, {
        organizationId: ORG,
        customerId: c.id,
        service: "corte",
        date: "2025-01-15",
        time: "11:00",
      })
      await cancelBooking(handle.db, {
        organizationId: ORG,
        id: second.id,
      })
      const taken = await listBookingsForDay(handle.db, {
        organizationId: ORG,
        date: "2025-01-15",
      })
      expect(taken.length).toBe(1)
      expect(taken[0]?.time).toBe("10:00")
    })
  })

  describe("availability", () => {
    it("returns half-hour slots between 09:00 and 17:00", async () => {
      const slots = await listAvailableSlots(handle.db, {
        organizationId: ORG,
        date: "2025-01-15",
      })
      expect(slots[0]).toEqual({ start: "09:00", end: "09:30" })
      expect(slots.at(-1)).toEqual({ start: "16:30", end: "17:00" })
      expect(slots.length).toBe(16) // 8 hours * 2 half-hour slots
    })

    it("excludes slots that have a pending or confirmed booking", async () => {
      const c = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000000",
        name: "Ana",
      })
      await createBooking(handle.db, {
        organizationId: ORG,
        customerId: c.id,
        service: "corte",
        date: "2025-01-15",
        time: "10:00",
      })
      const slots = await listAvailableSlots(handle.db, {
        organizationId: ORG,
        date: "2025-01-15",
      })
      expect(slots.find((s) => s.start === "10:00")).toBeUndefined()
    })
  })

  describe("conversations", () => {
    it("findOrCreateConversation reuses an existing row", async () => {
      const a = await findOrCreateConversation(handle.db, {
        organizationId: ORG,
        customerPhone: "+34600000000",
      })
      const b = await findOrCreateConversation(handle.db, {
        organizationId: ORG,
        customerPhone: "+34600000000",
      })
      expect(a.id).toBe(b.id)
    })

    it("appendMessageAndTouchConversation bumps updatedAt and writes the message", async () => {
      const conv = await findOrCreateConversation(handle.db, {
        organizationId: ORG,
        customerPhone: "+34600000000",
      })
      const initialUpdatedAt = conv.updatedAt
      // Force a measurable gap (Postgres timestamps have ms precision).
      await new Promise((r) => setTimeout(r, 10))
      const msg = await appendMessageAndTouchConversation(handle.db, {
        organizationId: ORG,
        conversationId: conv.id,
        role: "user",
        kind: "inbound_text",
        payload: { text: "Hola" },
      })
      expect(msg.conversationId).toBe(conv.id)
      const updated = await getConversationById(handle.db, {
        organizationId: ORG,
        id: conv.id,
      })
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(
        initialUpdatedAt.getTime(),
      )

      const messages = await listMessages(handle.db, {
        organizationId: ORG,
        conversationId: conv.id,
      })
      expect(messages.length).toBe(1)
      expect(messages[0]?.payload).toEqual({ text: "Hola" })
    })

    it("listBookingsForCustomer returns only the customer's bookings", async () => {
      const c = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000001",
        name: "B",
      })
      const other = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000002",
        name: "Other",
      })
      await createBooking(handle.db, {
        organizationId: ORG,
        customerId: c.id,
        service: "corte",
        date: "2025-02-01",
        time: "10:00",
      })
      await createBooking(handle.db, {
        organizationId: ORG,
        customerId: other.id,
        service: "corte",
        date: "2025-02-01",
        time: "11:00",
      })
      const bookings = await listBookingsForCustomer(handle.db, {
        organizationId: ORG,
        customerId: c.id,
      })
      expect(bookings.length).toBe(1)
      expect(bookings[0]?.customerId).toBe(c.id)
    })

    it("appendMessageAndTouchConversation rejects a cross-org conversation id", async () => {
      const conv = await findOrCreateConversation(handle.db, {
        organizationId: ORG,
        customerPhone: "+34600000000",
      })
      await expect(
        appendMessageAndTouchConversation(handle.db, {
          organizationId: "00000000-0000-0000-0000-000000000002",
          conversationId: conv.id,
          role: "user",
          kind: "inbound_text",
          payload: { text: "x" },
        }),
      ).rejects.toThrow(/not found/)
    })
  })

  describe("integration: create booking end-to-end", () => {
    it("upsert customer + create booking reads back consistently", async () => {
      const customer = await upsertCustomerByPhone(handle.db, {
        organizationId: ORG,
        phone: "+34600000000",
        name: "Ana",
      })
      const createdBooking = await createBooking(handle.db, {
        organizationId: ORG,
        customerId: customer.id,
        service: "corte",
        date: "2025-01-15",
        time: "10:00",
      })
      // The booking row references the customer row.
      const fromDb = await getBookingById(handle.db, {
        organizationId: ORG,
        id: createdBooking.id,
      })
      expect(fromDb?.customerId).toBe(customer.id)
      expect(fromDb?.status).toBe("pending")
      expect(fromDb?.service).toBe("corte")
      expect(fromDb?.date).toBe("2025-01-15")
      expect(fromDb?.time).toBe("10:00")
    })
  })

  describe("calendar events batch move", () => {
    it("applies every move in a single transaction", async () => {
      const a = await createEvent(handle.db, {
        organizationId: ORG,
        createdBy: null,
        summary: "A",
        startMs: 1000,
        endMs: 2000,
      })
      const b = await createEvent(handle.db, {
        organizationId: ORG,
        createdBy: null,
        summary: "B",
        startMs: 3000,
        endMs: 4000,
      })

      const updated = await batchMoveEvents(handle.db, {
        organizationId: ORG,
        moves: [
          { id: a.id, startMs: 5000, endMs: 6000 },
          { id: b.id, startMs: 7000, endMs: 8000 },
        ],
      })

      expect(updated).toHaveLength(2)
      expect(updated.find((e) => e.id === a.id)?.startMs).toBe(5000)
      expect(updated.find((e) => e.id === b.id)?.startMs).toBe(7000)
    })

    it("rolls back when any id is unknown", async () => {
      const a = await createEvent(handle.db, {
        organizationId: ORG,
        createdBy: null,
        summary: "A",
        startMs: 1000,
        endMs: 2000,
      })

      await expect(
        batchMoveEvents(handle.db, {
          organizationId: ORG,
          moves: [
            { id: a.id, startMs: 5000, endMs: 6000 },
            { id: "00000000-0000-0000-0000-deadbeef0000", startMs: 7, endMs: 8 },
          ],
        }),
      ).rejects.toBeInstanceOf(BatchMoveError)

      // `a` must still be at its original time — the transaction rolled back.
      const fromDb = await getEventById(handle.db, {
        organizationId: ORG,
        id: a.id,
      })
      expect(fromDb?.startMs).toBe(1000)
      expect(fromDb?.endMs).toBe(2000)
    })
  })
})
