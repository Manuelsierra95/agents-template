import { Hono } from "hono"
import { db as defaultDb, eq, organization as organizationTable, type DbClient } from "@workspace/db"
import type { AppEnv } from "@/app"

export type MeRouteOptions = {
  /** Optional DbClient override. Tests inject a fake to avoid hitting
   * a live database. */
  db?: DbClient
}

export function makeMeRoute(options: MeRouteOptions = {}) {
  const db: DbClient = options.db ?? defaultDb
  const route = new Hono<{ Variables: AppEnv["Variables"] }>()

  route.get("/", async (c) => {
    const auth = c.get("auth")
    if (!auth) {
      // requireAuth guards this path; defensive only.
      return c.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401)
    }
    const { user, organizationId, member } = auth

    // Look up the org's display name so the UI can render the
    // workspace switcher without an extra round-trip.
    const org = await db
      .select({ name: organizationTable.name })
      .from(organizationTable)
      .where(eq(organizationTable.id, organizationId))
      .limit(1)

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organizationId,
      organizationName: org[0]?.name ?? null,
      role: member.role,
    })
  })

  return route
}

export const meRoute = makeMeRoute()
