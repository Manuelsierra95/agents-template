import { Hono } from "hono"
import { z } from "zod"

import { db as defaultDb, eq, type DbClient } from "@workspace/db"
import { customer } from "@workspace/db/schema/customers"
import type { Env } from "@/config/env"
import { asStatus, errorBody } from "@/lib/responses"
import type { AppEnv } from "@/app"

/**
 * `GET /api/internal/customers?phone=...`
 *
 * Service-to-service endpoint hit by `apps/agent` when the agent
 * receives an inbound message. Looks up the customer record by phone
 * within the configured primary organization (single-tenant for now).
 *
 * Returns `null` (HTTP 200 with `{ customer: null }`) when no match
 * exists — a cold lead is the most common path, NOT an error.
 *
 * Auth: `requireInternalToken` middleware on the parent `api/internal`
 * namespace. We add a query-param Zod validation here so a bad input
 * returns 400 with a typed error instead of leaking DB errors.
 */

const phoneSchema = z
  .string()
  .min(8)
  .max(20)
  .regex(/^\+?[0-9\s()-]+$/u, "Phone must contain only digits and standard separators")

const querySchema = z.object({ phone: phoneSchema })

export type CustomerRouteOptions = {
  /** Optional DB override — tests inject a fake. */
  db?: DbClient
  /** Required — injected from `createApp` so the route doesn't read `process.env`. */
  organizationId: string
}

export function makeCustomerRoute(options: CustomerRouteOptions) {
  const db = options.db ?? defaultDb
  const route = new Hono<{ Variables: AppEnv["Variables"] }>()

  route.get("/", async (c) => {
    const parsed = querySchema.safeParse({
      phone: c.req.query("phone"),
    })
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_PHONE",
          parsed.error.issues[0]?.message ?? "Invalid phone",
        ),
        asStatus(400),
      )
    }
    const rows = await db
      .select()
      .from(customer)
      .where(eq(customer.phone, parsed.data.phone))
      .limit(1)
    const found = rows[0]
    return c.json({
      customer: found
        ? {
            id: found.id,
            organizationId: found.organizationId,
            name: found.name,
            phone: found.phone,
            email: found.email,
            metadata: found.metadata,
            createdAt:
              found.createdAt instanceof Date
                ? found.createdAt.toISOString()
                : String(found.createdAt),
            updatedAt:
              found.updatedAt instanceof Date
                ? found.updatedAt.toISOString()
                : String(found.updatedAt),
          }
        : null,
    })
  })

  return route
}
