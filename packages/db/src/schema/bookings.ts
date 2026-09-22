import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  uuid,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

import { organization } from "@workspace/db/schema/auth"
import { customer } from "@workspace/db/schema/customers"

/**
 * `booking_status` — lifecycle of a booking. Single source of truth;
 * the API layer maps this enum onto the Zod `status` fields that
 * calendar tools expose (`confirmed` / `pending` / `cancelled` /
 * `rescheduled`).
 *
 * # Why a Postgres enum
 *
 * Postgres enums are compact and self-documenting. We add new
 * statuses via a Drizzle migration when the business introduces them
 * (e.g. `no_show`); the API rejects unknown values at the boundary.
 */
export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "rescheduled",
  "completed",
  "no_show",
])

/**
 * `booking` — scheduled customer appointments.
 *
 * Keys:
 *   - `(customerId, date, time)` uniqueness is not enforced globally —
 *     a customer might hold two concurrent appointments at the same
 *     time during a race. We rely on the application layer to
 *     serialise through the API.
 *   - `(organizationId, date, time)` is indexed so the agent's
 *     `check_availability` query stays fast as bookings grow.
 *
 * `organizationId` is `text` to match `organization.id` (Better Auth).
 * `customerId` is the row's own `uuid` primary key.
 *
 * The `service` column is a free-text slug — different tenants ship
 * different service catalogs. Validation and normalisation happen
 * at the API boundary.
 */
export const booking = pgTable(
  "booking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    date: text("date").notNull(), // ISO `YYYY-MM-DD`
    time: text("time").notNull(), // `HH:mm`
    status: bookingStatus("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgDateTimeIdx: index("booking_org_date_time_idx").on(
      t.organizationId,
      t.date,
      t.time,
    ),
    customerIdx: index("booking_customer_idx").on(t.customerId),
    customerDateIdx: index("booking_customer_date_idx").on(t.customerId, t.date),
  }),
)

export const bookingRelations = relations(booking, ({ one }) => ({
  organization: one(organization, {
    fields: [booking.organizationId],
    references: [organization.id],
  }),
  customer: one(customer, {
    fields: [booking.customerId],
    references: [customer.id],
  }),
}))

export type Booking = typeof booking.$inferSelect
export type NewBooking = typeof booking.$inferInsert
export type BookingStatus = (typeof bookingStatus.enumValues)[number]
