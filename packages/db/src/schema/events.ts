import {
  pgTable,
  text,
  bigint,
  boolean,
  timestamp,
  pgEnum,
  uuid,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

import { organization, user } from "@workspace/db/schema/auth"

/**
 * `calendar_event_status` — lifecycle of a calendar event authored by an
 * operator user.
 *
 * # Why a Postgres enum
 *
 * Same reasoning as `booking_status`: the values are closed, well-known,
 * and self-documenting. New statuses arrive via Drizzle migrations; the
 * API rejects unknown values at the boundary.
 */
export const calendarEventStatus = pgEnum("calendar_event_status", [
  "confirmed",
  "cancelled",
])

/**
 * `calendar_event` — calendar entries authored by operators from the
 * dashboard (or, in future, by the agent runtime when an `event.created`
 * realtime event lands).
 *
 * # Multi-tenancy
 *
 * Every row carries `organizationId` so queries scope by the caller's
 * organization. The API layer enforces this in `where` clauses — a leak
 * from one tenant to another would require an explicit query bug, not
 * a missing `where`.
 *
 * # Time columns
 *
 * `start_ms` / `end_ms` are `bigint` (ms since epoch UTC). The UI works
 * exclusively in ms; converting to `timestamptz` here would force every
 * read to round-trip a timezone and lose the simple range-overlap query.
 * Validation that `end_ms > start_ms` is the API layer's responsibility
 * — by the time a row reaches this query the values are well-formed.
 *
 * # `created_by`
 *
 * The Better Auth `user.id` of the operator who created the row. ON
 * DELETE SET NULL so the event survives the user being removed (we
 * still want the org's history).
 */
export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    summary: text("summary").notNull(),
    description: text("description"),
    location: text("location"),
    startMs: bigint("start_ms", { mode: "number" }).notNull(),
    endMs: bigint("end_ms", { mode: "number" }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    color: text("color"),
    status: calendarEventStatus("status").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgStartIdx: index("calendar_event_org_start_idx").on(
      t.organizationId,
      t.startMs,
    ),
    createdByIdx: index("calendar_event_created_by_idx").on(t.createdBy),
  }),
)

export const calendarEventRelations = relations(calendarEvent, ({ one }) => ({
  organization: one(organization, {
    fields: [calendarEvent.organizationId],
    references: [organization.id],
  }),
  author: one(user, {
    fields: [calendarEvent.createdBy],
    references: [user.id],
  }),
}))

export type CalendarEvent = typeof calendarEvent.$inferSelect
export type NewCalendarEvent = typeof calendarEvent.$inferInsert
export type CalendarEventStatus =
  (typeof calendarEventStatus.enumValues)[number]
