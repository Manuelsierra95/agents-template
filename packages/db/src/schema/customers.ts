import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

import { organization } from "@workspace/db/schema/auth"

/**
 * `customer` — customers that contact the agent (or that the agent
 * books for).
 *
 * Multi-tenancy: every row carries `organizationId` so queries scope by
 * the caller's organization. The agent-facing internal endpoints
 * (`/api/internal/customers/*`) inject the org from the environment
 * (`ORGANIZATION_ID`) because the agent itself is single-tenant.
 *
 * `# organizationId` column type
 *
 * `organization.id` (Better Auth) is `text` — we keep this column
 * `text` too so the FK can be enforced at the DB level. The cast
 * happens at the application boundary.
 *
 * # Phone is the lookup key
 *
 * Customer identification in the agent flow is by phone number (the
 * user sends a WhatsApp message, the agent looks them up). `phone` is
 * normalised to E.164 at the application boundary and stored as a
 * unique index per organization.
 */
export const customer = pgTable(
  "customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    // Tenant-defined attributes (tags, last visit, custom fields).
    // Stored as JSON to avoid coupling the schema to per-tenant
    // extensions; validation happens at the API boundary, not here.
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One customer per (organization, phone) — the agent never sees
    // a duplicate row when the same WhatsApp number hits twice.
    orgPhoneIdx: uniqueIndex("customer_org_phone_idx").on(t.organizationId, t.phone),
    orgIdx: index("customer_org_idx").on(t.organizationId),
  }),
)

export const customerRelations = relations(customer, ({ one }) => ({
  organization: one(organization, {
    fields: [customer.organizationId],
    references: [organization.id],
  }),
}))

export type Customer = typeof customer.$inferSelect
export type NewCustomer = typeof customer.$inferInsert
