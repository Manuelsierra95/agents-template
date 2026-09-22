import { and, eq } from "drizzle-orm"

import type { DbClient } from "@workspace/db"
import { customer } from "@workspace/db/schema/customers"
import type { Customer, NewCustomer } from "@workspace/db/schema/customers"

/**
 * Customer queries. Multi-tenant: every query takes `organizationId`
 * so a leak from one tenant to another requires an explicit query
 * bug, not a missing `where`.
 */

/**
 * Look up a customer by phone within an organization.
 *
 * Returns `undefined` when no match exists. The agent uses this on
 * every inbound message to attach a customer record to the
 * conversation; the absence of a record is a normal cold-lead path,
 * NOT an error.
 */
export async function getCustomerByPhone(
  db: DbClient,
  args: { organizationId: string; phone: string },
): Promise<Customer | undefined> {
  const rows = await db
    .select()
    .from(customer)
    .where(
      and(eq(customer.organizationId, args.organizationId), eq(customer.phone, args.phone)),
    )
    .limit(1)
  return rows[0]
}

export async function getCustomerById(
  db: DbClient,
  args: { organizationId: string; id: string },
): Promise<Customer | undefined> {
  const rows = await db
    .select()
    .from(customer)
    .where(and(eq(customer.id, args.id), eq(customer.organizationId, args.organizationId)))
    .limit(1)
  return rows[0]
}

/**
 * Upsert by phone within an organization.
 *
 * If a customer with `(organizationId, phone)` exists, returns it
 * unchanged (caller can update fields separately if needed). If
 * not, creates a new row with the given `name` (and optional
 * `email`/`metadata`) and returns it.
 */
export async function upsertCustomerByPhone(
  db: DbClient,
  args: { organizationId: string; phone: string; name: string; email?: string; metadata?: Record<string, unknown> },
): Promise<Customer> {
  const existing = await getCustomerByPhone(db, args)
  if (existing) return existing

  const row: NewCustomer = {
    organizationId: args.organizationId,
    phone: args.phone,
    name: args.name,
    ...(args.email ? { email: args.email } : {}),
    ...(args.metadata ? { metadata: args.metadata } : {}),
  }
  const inserted = await db.insert(customer).values(row).returning()
  const created = inserted[0]
  if (!created) {
    throw new Error(
      "upsertCustomerByPhone: insert returned no rows (race condition?)",
    )
  }
  return created
}

export async function listCustomersByOrganization(
  db: DbClient,
  args: { organizationId: string; limit?: number },
): Promise<Customer[]> {
  return db
    .select()
    .from(customer)
    .where(eq(customer.organizationId, args.organizationId))
    .limit(args.limit ?? 50)
}
