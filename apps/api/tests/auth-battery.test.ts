/**
 * End-to-end auth battery for apps/api.
 *
 * Exercises the full HTTP surface — `/api/auth/*` Better Auth handler,
 * the protected `/api/me` endpoint, and the SSE `/api/events` stream —
 * via the real `createApp` so middleware (CORS, error handler,
 * `requireAuth`) participates in the assertions.
 *
 * The test mounts a private `createAuth({ db, user.deleteUser })`
 * instance on the app, so we never touch the production `auth`
 * singleton. `beforeEach(resetDb)` keeps the suite deterministic.
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest"
import { createApp, type AppEnv } from "@/app"
import { loadEnv } from "@/config/env"
import { makeSseClient } from "./sse-client"
import {
  createDbHandle,
  type DbHandle,
  db as authDbProxy,
  eq,
  member,
  organization as organizationTable,
  resetDefaultDb,
  session as sessionTable,
  user as userTable,
} from "@workspace/db"
import { createAuth, type Auth } from "@workspace/auth"

const TEST_DB_URL = process.env.DATABASE_URL_TEST

const skipIfNoDb = TEST_DB_URL ? describe : describe.skip

function extractSetCookies(res: Response): string[] {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(res.headers)
  }
  const single = res.headers.get("set-cookie")
  return single ? [single] : []
}

function mergeCookies(...sources: (string | undefined)[]): string {
  const map = new Map<string, string>()
  for (const src of sources) {
    if (!src) continue
    for (const pair of src.split(/;\s*/)) {
      const eq = pair.indexOf("=")
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      if (name && value) map.set(name, value)
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function resetDb(handle: DbHandle): Promise<void> {
  await handle.sql.unsafe(
    `TRUNCATE TABLE
       invitation,
       member,
       organization,
       session,
       account,
       verification,
       jwks,
       "user"
     RESTART IDENTITY CASCADE`,
  )
}

async function postJson(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  cookies?: string,
) {
  const res = await app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:4000",
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  const setCookies = extractSetCookies(res)
  const json = res.headers.get("content-type")?.includes("json")
    ? await res.json()
    : null
  return {
    status: res.status,
    cookies: mergeCookies(cookies, setCookies.join("; ")),
    body: json,
  }
}

async function getJson(
  app: ReturnType<typeof createApp>,
  path: string,
  cookies?: string,
) {
  const res = await app.request(path, {
    method: "GET",
    headers: {
      Origin: "http://localhost:4000",
      ...(cookies ? { Cookie: cookies } : {}),
    },
  })
  const json = res.headers.get("content-type")?.includes("json")
    ? await res.json()
    : null
  return {
    status: res.status,
    cookies: mergeCookies(cookies, extractSetCookies(res).join("; ")),
    body: json,
  }
}

type AuthClient = {
  signUp: (
    email: string,
    name: string,
  ) => Promise<{ cookies: string; status: number; body: any }>
  signIn: (
    email: string,
    password?: string,
  ) => Promise<{ cookies: string; status: number; body: any }>
  signOut: (
    cookies: string,
  ) => Promise<{ cookies: string; status: number; body: any }>
  deleteUser: (
    cookies: string,
  ) => Promise<{ cookies: string; status: number; body: any }>
  createOrg: (
    cookies: string,
    name: string,
    slug: string,
  ) => Promise<{
    orgId: string
    cookies: string
    status: number
    body: any
  }>
  setActive: (
    cookies: string,
    organizationId: string,
  ) => Promise<{ cookies: string; status: number; body: any }>
  inviteMember: (
    cookies: string,
    email: string,
    role: string,
    organizationId: string,
  ) => Promise<{ cookies: string; status: number; body: any }>
  acceptInvitation: (
    cookies: string,
    invitationId: string,
  ) => Promise<{ cookies: string; status: number; body: any }>
  cancelInvitation: (
    cookies: string,
    invitationId: string,
  ) => Promise<{ cookies: string; status: number; body: any }>
}

function buildClient(app: ReturnType<typeof createApp>, auth: Auth): AuthClient {
  return {
    async signUp(email, name) {
      return postJson(app, "/api/auth/sign-up/email", {
        email,
        password: "password1234",
        name,
      })
    },
    async signIn(email, password = "password1234") {
      return postJson(app, "/api/auth/sign-in/email", { email, password })
    },
    async signOut(cookies) {
      const res = await app.request("/api/auth/sign-out", {
        method: "POST",
        headers: {
          Origin: "http://localhost:4000",
          Cookie: cookies,
        },
      })
      return {
        status: res.status,
        cookies: mergeCookies(cookies, extractSetCookies(res).join("; ")),
        body: res.headers.get("content-type")?.includes("json")
          ? await res.json()
          : null,
      }
    },
    async deleteUser(cookies) {
      return postJson(app, "/api/auth/delete-user", {}, cookies)
    },
    async createOrg(cookies, name, slug) {
      const r = await postJson(
        app,
        "/api/auth/organization/create",
        { name, slug },
        cookies,
      )
      const body = r.body as { id?: string } | { data?: { id?: string } } | null
      const orgId: string | undefined =
        (body as { id?: string } | null)?.id ??
        (body as { data?: { id?: string } } | null)?.data?.id
      return { orgId: orgId ?? "", cookies: r.cookies, status: r.status, body: r.body }
    },
    async setActive(cookies, organizationId) {
      return postJson(
        app,
        "/api/auth/organization/set-active",
        { organizationId },
        cookies,
      )
    },
    async inviteMember(cookies, email, role, organizationId) {
      return postJson(
        app,
        "/api/auth/organization/invite-member",
        { email, role, organizationId },
        cookies,
      )
    },
    async acceptInvitation(cookies, invitationId) {
      return postJson(
        app,
        "/api/auth/organization/accept-invitation",
        { invitationId },
        cookies,
      )
    },
    async cancelInvitation(cookies, invitationId) {
      return postJson(
        app,
        "/api/auth/organization/cancel-invitation",
        { invitationId },
        cookies,
      )
    },
  }
}

skipIfNoDb("API auth battery (e2e)", () => {
  let handle: DbHandle
  let auth: Auth
  let app: ReturnType<typeof createApp>
  let client: AuthClient

  beforeAll(async () => {
    if (!TEST_DB_URL) return
    handle = createDbHandle(TEST_DB_URL)
    // Override the default-DB singleton so `createApp`'s built-in
    // `requireAuth` middleware (which uses `defaultAuth`) reads from
    // the same test DB as the `/api/auth/*` handler we mount below.
    // `createApp({ auth })` only overrides the Better Auth handler,
    // not the middleware, so this is the cleanest way to keep both
    // sides aligned without touching production code.
    process.env.DATABASE_URL = TEST_DB_URL
    // The default-DB proxy caches its connection on first use. If an
    // earlier suite (or even a sibling file) has already touched it,
    // our `DATABASE_URL` override arrives too late. Resetting the
    // cache forces the next `getDb()` to re-read the env.
    resetDefaultDb()
    auth = createAuth({
      db: handle.db,
      user: { deleteUser: { enabled: true } },
    })
    app = createApp(
      loadEnv({
        NODE_ENV: "test",
        CORS_ORIGINS: "http://localhost:3000",
        LOG_LEVEL: "error",
        AUTH_SECRET: "testtesttesttesttesttesttesttest",
        AUTH_BASE_URL: "http://localhost:4000",
        AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
        DATABASE_URL: TEST_DB_URL,
      }),
      { auth },
    )
    client = buildClient(app, auth)
  })

  beforeEach(async () => {
    await resetDb(handle)
  })

  afterAll(async () => {
    await handle?.close()
  })

  // ─── 1. sign-up + /api/me ────────────────────────────────────────────
  it("signs up via /api/auth and the resulting cookie unlocks /api/me", async () => {
    const email = `signup-${uniqueSuffix()}@test.local`
    const su = await client.signUp(email, "Signup")
    expect(su.status).toBe(200)
    expect(su.cookies).toMatch(/better-auth\.session_token=/)

    const me = await app.request("/api/me", {
      headers: { Cookie: su.cookies },
    })
    expect(me.status).toBe(200)
    const body = (await me.json()) as {
      user: { id: string; email: string }
      organizationId: string
      role: string
    }
    expect(body.user.email).toBe(email)
    expect(body.organizationId).toBeTruthy()
    expect(body.role).toBe("owner")
    void authDbProxy
  })

  // ─── 2. sign-in + /api/me ────────────────────────────────────────────
  it("signs in via /api/auth and /api/me reflects the session", async () => {
    const email = `signin-${uniqueSuffix()}@test.local`
    await client.signUp(email, "Signin")

    const si = await client.signIn(email, "password1234")
    expect(si.status).toBe(200)
    expect(si.cookies).toMatch(/better-auth\.session_token=/)

    const me = await app.request("/api/me", {
      headers: { Cookie: si.cookies },
    })
    expect(me.status).toBe(200)
    const body = (await me.json()) as { user: { email: string } }
    expect(body.user.email).toBe(email)
  })

  // ─── 3. sign-in wrong creds → /api/me 401 ────────────────────────────
  it("wrong password blocks /api/me", async () => {
    const email = `badpw-${uniqueSuffix()}@test.local`
    await client.signUp(email, "Bad")

    const si = await client.signIn(email, "not-the-password")
    expect(si.status).toBe(401)

    const me = await app.request("/api/me", {
      headers: { Cookie: si.cookies },
    })
    expect(me.status).toBe(401)
    const body = (await me.json()) as { error: { code: string } }
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  // ─── 4. sign-out ─────────────────────────────────────────────────────
  it("signs out and /api/me starts returning 401", async () => {
    const email = `signout-${uniqueSuffix()}@test.local`
    const su = await client.signUp(email, "SO")

    const out = await client.signOut(su.cookies)
    expect(out.status).toBe(200)

    const me = await app.request("/api/me", {
      headers: { Cookie: out.cookies },
    })
    expect(me.status).toBe(401)

    // The session row is gone in the DB.
    const remaining = await handle.db.select().from(sessionTable)
    expect(remaining).toHaveLength(0)
  })

  // ─── 5. delete-user ──────────────────────────────────────────────────
  it("deletes the user and /api/me rejects the stale cookie", async () => {
    const email = `del-${uniqueSuffix()}@test.local`
    const su = await client.signUp(email, "Del")

    const del = await client.deleteUser(su.cookies)
    expect(del.status).toBe(200)

    const me = await app.request("/api/me", {
      headers: { Cookie: del.cookies },
    })
    expect(me.status).toBe(401)

    const users = await handle.db.select().from(userTable)
    expect(users).toHaveLength(0)
  })

  // ─── 6. create-org + set-active reflected on /api/me ─────────────────
  it("set-active switches the organizationId reported by /api/me", async () => {
    const email = `sa-${uniqueSuffix()}@test.local`
    const su = await client.signUp(email, "SA")
    const me0 = (await (await app.request("/api/me", {
      headers: { Cookie: su.cookies },
    })).json()) as { organizationId: string }
    expect(me0.organizationId).toBeTruthy()

    const org = await client.createOrg(
      su.cookies,
      `Org ${uniqueSuffix()}`,
      `org-${uniqueSuffix()}`,
    )
    expect(org.status).toBe(200)
    expect(org.orgId).toBeTruthy()

    const set = await client.setActive(su.cookies, org.orgId)
    expect(set.status).toBe(200)

    const me1 = (await (await app.request("/api/me", {
      headers: { Cookie: set.cookies },
    })).json()) as { organizationId: string; role: string }
    expect(me1.organizationId).toBe(org.orgId)
    expect(me1.role).toBe("owner")
  })

  // ─── 7. invite → accept → /api/me reflects the org ───────────────────
  it("invite → accept flow lets the invitee reach /api/me for the org", async () => {
    const ownerEmail = `owner-${uniqueSuffix()}@test.local`
    const owner = await client.signUp(ownerEmail, "Owner")
    const org = await client.createOrg(
      owner.cookies,
      `Org ${uniqueSuffix()}`,
      `org-${uniqueSuffix()}`,
    )

    const inviteeEmail = `invitee-${uniqueSuffix()}@test.local`
    const inv = await client.inviteMember(
      owner.cookies,
      inviteeEmail,
      "member",
      org.orgId,
    )
    expect(inv.status).toBe(200)
    const invitationId = (inv.body as { id?: string }).id!
    expect(invitationId).toBeTruthy()

    const invitee = await client.signUp(inviteeEmail, "Invitee")
    const accept = await client.acceptInvitation(
      invitee.cookies,
      invitationId,
    )
    expect(accept.status).toBe(200)

    const me = (await (await app.request("/api/me", {
      headers: { Cookie: accept.cookies },
    })).json()) as { organizationId: string; role: string; user: { email: string } }
    expect(me.user.email).toBe(inviteeEmail)
    expect(me.organizationId).toBe(org.orgId)
    expect(me.role).toBe("member")
  })

  // ─── 8. cancel-invitation blocks subsequent accept ───────────────────
  it("cancelling an invitation prevents accept", async () => {
    const ownerEmail = `cancel-owner-${uniqueSuffix()}@test.local`
    const owner = await client.signUp(ownerEmail, "Owner")
    const org = await client.createOrg(
      owner.cookies,
      `Org ${uniqueSuffix()}`,
      `org-${uniqueSuffix()}`,
    )
    const inviteeEmail = `cancel-target-${uniqueSuffix()}@test.local`
    const inv = await client.inviteMember(
      owner.cookies,
      inviteeEmail,
      "member",
      org.orgId,
    )
    const invitationId = (inv.body as { id?: string }).id!

    const cancel = await client.cancelInvitation(owner.cookies, invitationId)
    expect(cancel.status).toBe(200)

    const invitee = await client.signUp(inviteeEmail, "Invitee")
    const accept = await client.acceptInvitation(
      invitee.cookies,
      invitationId,
    )
    expect(accept.status).toBeGreaterThanOrEqual(400)
  })

  // ─── 9. /api/events with a valid cookie opens the SSE stream ─────────
  it("returns text/event-stream on /api/events for an authenticated session", async () => {
    const email = `sse-${uniqueSuffix()}@test.local`
    const su = await client.signUp(email, "SSE")

    const res = await app.request("/api/events", {
      headers: { Cookie: su.cookies, Accept: "text/event-stream" },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/)
    // No bus is bound in this test (no `eventBus` option), so the
    // stream stays idle until the 15s keep-alive fires. We just
    // assert the stream is open and abortable — the keep-alive
    // cadence is covered by `events-auth.test.ts` indirectly.
    expect(res.body).toBeTruthy()
    await res.body?.cancel()
  })

  // ─── 10. /api/events after sign-out is 401 ───────────────────────────
  it("rejects /api/events after sign-out", async () => {
    const email = `sse-so-${uniqueSuffix()}@test.local`
    const su = await client.signUp(email, "SSE")
    const out = await client.signOut(su.cookies)
    expect(out.status).toBe(200)

    const res = await app.request("/api/events", {
      headers: { Cookie: out.cookies, Accept: "text/event-stream" },
    })
    expect(res.status).toBe(401)
  })

  // ─── 11. cookies: not duplicated, replaced on re-sign-in ─────────────
  it("does not stack duplicate session cookies after set-active and re-sign-in", async () => {
    const email = `cookies-${uniqueSuffix()}@test.local`
    const su = await client.signUp(email, "Cookies")
    const org = await client.createOrg(
      su.cookies,
      `Org ${uniqueSuffix()}`,
      `org-${uniqueSuffix()}`,
    )
    const set = await client.setActive(su.cookies, org.orgId)

    // Count occurrences of better-auth.session_token in the cookie string.
    const count = (s: string, needle: string) =>
      s.split(/;\s*/).filter((c) => c.startsWith(needle)).length
    expect(count(set.cookies, "better-auth.session_token=")).toBe(1)

    // Re-sign-in replaces (not duplicates) the cookie.
    const si = await client.signIn(email, "password1234")
    expect(count(si.cookies, "better-auth.session_token=")).toBe(1)
  })

  // ─── 12. unknown path returns a JSON 404 ─────────────────────────────
  it("returns a structured 404 for unknown routes", async () => {
    const res = await app.request("/api/this-does-not-exist")
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND")
    expect(body.error.message).toMatch(/not found/i)
  })

  // ─── 13. middleware path: /api/me 401 with tampered cookie ───────────
  it("/api/me rejects a tampered session cookie", async () => {
    const res = await app.request("/api/me", {
      headers: { Cookie: "better-auth.session_token=garbage.not-a-signature" },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  // ─── 14. requireRole guard via direct app wiring ─────────────────────
  it("blocks a `member` user from an owner-only endpoint mounted under requireRole", async () => {
    // We mount a temporary route on a sibling app to exercise the
    // `requireRole` middleware end-to-end. The main app doesn't have
    // owner-only routes yet, so we add one for this test.
    const ownerEmail = `rbac-owner-${uniqueSuffix()}@test.local`
    const owner = await client.signUp(ownerEmail, "Owner")
    const org = await client.createOrg(
      owner.cookies,
      `Org ${uniqueSuffix()}`,
      `org-${uniqueSuffix()}`,
    )
    // Demote the owner to "member" directly in DB to simulate the
    // member-role scenario without needing a second user.
    await handle.db
      .update(member)
      .set({ role: "member" })
      .where(eq(member.userId, (owner.body as { user?: { id?: string } }).user?.id!))

    // Re-sign-in to get a session that reflects the demoted role.
    const reSign = await client.signIn(ownerEmail, "password1234")
    expect(reSign.status).toBe(200)

    // Wire a one-off app that mounts /api/secret under requireAuth + requireRole.
    const { Hono } = await import("hono")
    const { createRequireAuth, requireRole } = await import("@workspace/auth")
    const requireAuthMw = createRequireAuth(auth, { db: handle.db })
    const rbacApp = new Hono<{ Variables: { auth: AppEnv["Variables"]["auth"] } }>()
    rbacApp.use("/api/secret", requireAuthMw)
    rbacApp.use("/api/secret", requireRole("owner"))
    rbacApp.get("/api/secret", (c) => c.json({ ok: true }))

    // Merge the protected route onto the main app for this test.
    const merged = new Hono()
    merged.route("/", app)
    merged.route("/", rbacApp)

    const res = await merged.request("/api/secret", {
      headers: { Cookie: reSign.cookies },
    })
    expect(res.status).toBe(403)
    void org
  })

  // ─── 15. /api/me 403 when active org has no membership (defensive) ──
  it("/api/me returns 403 when the session points to an org the user is not in", async () => {
    const email = `iso-${uniqueSuffix()}@test.local`
    const su = await client.signUp(email, "Iso")
    const userId = (su.body as { user?: { id?: string } }).user?.id

    // Create a foreign org that this user is NOT a member of, then
    // force the session's activeOrganizationId to point at it.
    const foreignOrgId = `foreign-${uniqueSuffix()}`
    await handle.db.insert(organizationTable).values({
      id: foreignOrgId,
      name: `Foreign ${uniqueSuffix()}`,
      slug: `foreign-${uniqueSuffix()}`,
      createdAt: new Date(),
    })

    await handle.db
      .update(sessionTable)
      .set({ activeOrganizationId: foreignOrgId })
      .where(eq(sessionTable.userId, userId!))

    const res = await app.request("/api/me", {
      headers: { Cookie: su.cookies },
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe("FORBIDDEN")
    expect(body.error.message).toMatch(/Organization context/)
  })

  // Silence unused-import warning for the auth default-DB proxy. Tests
  // use `handle.db` directly; this import guarantees the proxy is
  // initialised once before any Better Auth handler runs.
})
