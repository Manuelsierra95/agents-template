import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { Hono } from "hono"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { eq } from "drizzle-orm"
import {
  createAuth,
  createRequireAuth,
  requireRole,
  type AuthVars,
} from "../src/index"
import {
  createDbHandle,
  type DbHandle,
  session as sessionTable,
  member,
  organization,
} from "@workspace/db"
import {
  buildAuthClient,
  resetDb,
  uniqueSuffix,
  extractCookies,
  extractSessionToken,
  mergeCookies,
  type AuthClient,
} from "./helpers"

const TEST_DB_URL = process.env.DATABASE_URL_TEST

const skipIfNoDb = TEST_DB_URL ? describe : describe.skip

// Mirror the production error handler shape so HTTPException → JSON.
function jsonErrorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    const code =
      err.status === 401
        ? "UNAUTHORIZED"
        : err.status === 403
          ? "FORBIDDEN"
          : "HTTP_ERROR"
    return c.json({ error: { code, message: err.message } }, err.status)
  }
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: err.message } },
    500,
  )
}

skipIfNoDb("requireAuth (middleware)", () => {
  let handle: DbHandle
  let auth: ReturnType<typeof createAuth>
  let app: Hono<{ Variables: AuthVars }>
  let client: AuthClient

  beforeAll(async () => {
    if (!TEST_DB_URL) return
    handle = createDbHandle(TEST_DB_URL)
    await resetDb(handle)
    auth = createAuth({ db: handle.db })
    const requireAuthMw = createRequireAuth(auth, { db: handle.db })
    client = buildAuthClient(auth)

    app = new Hono<{ Variables: AuthVars }>()
    app.onError(jsonErrorHandler)
    app.use("/protected/*", requireAuthMw)
    app.get("/protected/echo", (c) => {
      const auth = c.get("auth")
      return c.json({
        userId: auth.user.id,
        organizationId: auth.organizationId,
        role: auth.member.role,
      })
    })
  })

  afterAll(async () => {
    await handle?.close()
  })

  it("rejects requests with no session cookie", async () => {
    const res = await app.request("/protected/echo")
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  it("rejects requests with an invalid cookie", async () => {
    const res = await app.request("/protected/echo", {
      headers: { Cookie: "better-auth.session_token=garbage" },
    })
    expect(res.status).toBe(401)
  })

  it("accepts a freshly signed-up user with an active organization", async () => {
    const suffix = uniqueSuffix()
    const email = `auth-${suffix}@test.local`
    const { cookies: c1 } = await client.signUp(email, "Test User")
    const { orgId, cookies: c2 } = await client.createOrg(c1, `Org ${suffix}`, `org-${suffix}`)
    expect(orgId).toBeTruthy()
    const { cookies: c3 } = await client.setActive(c2, orgId!)

    const res = await app.request("/protected/echo", { headers: { Cookie: c3 } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      userId: string
      organizationId: string
      role: string
    }
    expect(body.organizationId).toBe(orgId)
    expect(body.role).toBe("owner")
  })

  it("rejects when the active organization has no membership (defensive)", async () => {
    // Defensive test: simulate an inconsistent state where a session row
    // points to an organization the user is not a member of. Better Auth's
    // own API refuses to setActive in this state, so we manipulate the
    // DB directly. requireAuth must still reject.
    const suffix = uniqueSuffix()

    const aEmail = `no-member-${suffix}@test.local`
    const { cookies: aCookies } = await client.signUp(aEmail, "No Member")
    const { orgId: orgAId, cookies: aActiveCookies } = await client.createOrg(
      aCookies,
      `Org A ${suffix}`,
      `org-a-${suffix}`,
    )

    const orgBId = `org-b-${suffix}`
    await handle.db.insert(organization).values({
      id: orgBId,
      name: `Org B ${suffix}`,
      slug: `org-b-${suffix}`,
      createdAt: new Date(),
    })

    expect(orgAId).toBeTruthy()
    expect(orgBId).toBeTruthy()
    expect(orgAId).not.toBe(orgBId)

    const token = extractSessionToken(aActiveCookies)
    expect(token).toBeTruthy()
    await handle.db
      .update(sessionTable)
      .set({ activeOrganizationId: orgBId })
      .where(eq(sessionTable.token, token!))

    const res = await app.request("/protected/echo", {
      headers: { Cookie: aActiveCookies },
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe("FORBIDDEN")
    expect(body.error.message).toMatch(/Organization context/)
  })
})

skipIfNoDb("requireRole (middleware)", () => {
  let handle: DbHandle
  let auth: ReturnType<typeof createAuth>
  let app: Hono<{ Variables: AuthVars }>
  let client: AuthClient

  beforeAll(async () => {
    if (!TEST_DB_URL) return
    handle = createDbHandle(TEST_DB_URL)
    await resetDb(handle)
    auth = createAuth({ db: handle.db })
    const requireAuthMw = createRequireAuth(auth, { db: handle.db })
    client = buildAuthClient(auth)

    app = new Hono<{ Variables: AuthVars }>()
    app.onError(jsonErrorHandler)
    app.use("/owner/*", requireAuthMw)
    app.use("/owner/secret", requireRole("owner"))
    app.get("/owner/secret", (c) => c.json({ ok: true }))

    app.use("/admin/*", requireAuthMw)
    app.use("/admin/secret", requireRole("admin"))
    app.get("/admin/secret", (c) => c.json({ ok: true }))
  })

  afterAll(async () => {
    await handle?.close()
  })

  it("returns 401 when no auth context is set", async () => {
    const res = await app.request("/owner/secret")
    expect(res.status).toBe(401)
  })

  it("accepts an owner against an `owner` requirement", async () => {
    const suffix = uniqueSuffix()
    const { cookies: c1 } = await client.signUp(`owner-${suffix}@test.local`, "Owner")
    const { orgId, cookies: c2 } = await client.createOrg(c1, `Org ${suffix}`, `org-${suffix}`)
    expect(orgId).toBeTruthy()
    const { cookies: c3 } = await client.setActive(c2, orgId!)

    const res = await app.request("/owner/secret", { headers: { Cookie: c3 } })
    expect(res.status).toBe(200)
  })

  it("accepts an owner against an `admin` requirement (admin < owner)", async () => {
    const suffix = uniqueSuffix()
    const { cookies: c1 } = await client.signUp(`owner2-${suffix}@test.local`, "Owner")
    const { orgId, cookies: c2 } = await client.createOrg(c1, `Org ${suffix}`, `org2-${suffix}`)
    expect(orgId).toBeTruthy()
    const { cookies: c3 } = await client.setActive(c2, orgId!)

    const res = await app.request("/admin/secret", { headers: { Cookie: c3 } })
    expect(res.status).toBe(200)
  })

  it("rejects a member against an `owner` requirement", async () => {
    const suffix = uniqueSuffix()

    const { cookies: ownerC1 } = await client.signUp(
      `admin1-${suffix}@test.local`,
      "Admin",
    )
    const { orgId, cookies: ownerC2 } = await client.createOrg(
      ownerC1,
      `Org ${suffix}`,
      `org3-${suffix}`,
    )
    expect(orgId).toBeTruthy()
    const orgIdNonNull = orgId!

    const memberEmail = `member-${suffix}@test.local`
    const memberSignUp = await client.signUp(memberEmail, "Member")
    expect(memberSignUp.status).toBe(200)

    const memberAuthApp = new Hono()
    memberAuthApp.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    const signInRes = await memberAuthApp.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: JSON.stringify({ email: memberEmail, password: "password1234" }),
    })
    expect(signInRes.status).toBe(200)
    const memberCookies = extractCookies(signInRes).map((c) => c.split(";")[0]).join("; ")
    const memberBody = (await signInRes.json()) as { user: { id: string } }
    const memberUserId = memberBody.user.id

    await handle.db.insert(member).values({
      id: `${memberUserId}-${orgIdNonNull}`,
      organizationId: orgIdNonNull,
      userId: memberUserId,
      role: "member",
      createdAt: new Date(),
    })

    const setActiveRes = await memberAuthApp.request(
      "/api/auth/organization/set-active",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:4000",
          Cookie: memberCookies,
        },
        body: JSON.stringify({ organizationId: orgId }),
      },
    )
    const finalCookies = mergeCookies(
      memberCookies,
      extractCookies(setActiveRes).join("; "),
    )

    const res = await app.request("/owner/secret", {
      headers: { Cookie: finalCookies },
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe("FORBIDDEN")
    void ownerC2 // silence unused
  })
})
