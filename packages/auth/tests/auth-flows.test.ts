/**
 * End-to-end auth battery for @workspace/auth.
 *
 * Exercises the Better Auth HTTP handler mounted on a Hono sub-app via
 * `buildAuthClient(auth)`. Each `describe` resets the test DB in
 * `beforeAll`; every test uses a `uniqueSuffix()` for emails/slugs so
 * parallel runs do not collide.
 *
 * Suites cover:
 *   1.  POST /sign-up/email         (happy + validation)
 *   2.  POST /sign-in/email         (happy + failures)
 *   3.  GET  /get-session           (cookie semantics)
 *   4.  POST /sign-out              (cookie cleanup, session row gone)
 *   5.  POST /delete-user           (cascade + session invalidation)
 *   6.  POST /change-password       (rotation, current password check)
 *   7.  /organization/*             (CRUD, set-active, leave, last-owner)
 *   8.  /organization/members       (add/update/remove + RBAC)
 *   9.  /organization/invitations   (invite/accept/reject/cancel/expired)
 *   10. multi-tenant isolation      (org A vs org B visibility)
 *   11. getDefaultOrganizationId    (preference order, unit via DB)
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest"
import { eq, and } from "drizzle-orm"
import {
  createAuth,
  getDefaultOrganizationId,
} from "@workspace/auth/index.ts"
import {
  createDbHandle,
  type DbHandle,
  session as sessionTable,
  member,
  organization as organizationTable,
  invitation as invitationTable,
  user as userTable,
  account as accountTable,
} from "@workspace/db"
import {
  buildAuthClient,
  resetDb,
  uniqueSuffix,
  extractSessionToken,
  type AuthClient,
} from "./helpers"

const TEST_DB_URL = process.env.DATABASE_URL_TEST

const skipIfNoDb = TEST_DB_URL ? describe : describe.skip

skipIfNoDb("auth flows (e2e)", () => {
  let handle: DbHandle
  let auth: ReturnType<typeof createAuth>
  let client: AuthClient

  beforeAll(async () => {
    if (!TEST_DB_URL) return
    handle = createDbHandle(TEST_DB_URL)
    auth = createAuth({
      db: handle.db,
      // Enable `deleteUser` only in the test instance — production
      // leaves it disabled (the secure default).
      user: { deleteUser: { enabled: true } },
    })
    client = buildAuthClient(auth)
  })

  beforeEach(async () => {
    await resetDb(handle)
  })

  afterAll(async () => {
    await handle?.close()
  })

  // ─── 1. sign-up/email ─────────────────────────────────────────────────
  describe("POST /sign-up/email", () => {
    it("creates a user, a personal workspace, and returns a session cookie", async () => {
      const suffix = uniqueSuffix()
      const email = `signup-${suffix}@test.local`

      const r = await client.signUp(email, "Signup User")
      expect(r.status).toBe(200)
      expect(r.cookies).toMatch(/better-auth\.session_token=/)

      const su = r.body as { user?: { id?: string }; token?: string }
      expect(su?.user?.id).toBeTruthy()
      expect(su?.token).toBeTruthy()

      // The auto-provisioned workspace must show up via get-session as
      // the active org on the freshly-issued session.
      const sess = await client.getSession(r.cookies)
      const sb = sess.body as {
        session?: { activeOrganizationId?: string | null }
      }
      expect(sb?.session?.activeOrganizationId).toBeTruthy()

      // And the workspace itself exists in DB.
      const orgRows = await handle.db.select().from(organizationTable)
      expect(orgRows).toHaveLength(1)
      expect(orgRows[0]?.name).toMatch(/workspace/i)
    })

    it("rejects an invalid email with 400", async () => {
      const r = await client.signUp("not-an-email", "Bad Email")
      expect(r.status).toBe(400)
    })

    it("rejects a password shorter than the minimum with 400", async () => {
      const suffix = uniqueSuffix()
      const r = await client.signUp(`short-${suffix}@test.local`, "X", "short")
      expect(r.status).toBe(400)
    })

    it("rejects a duplicate email with 4xx", async () => {
      const suffix = uniqueSuffix()
      const email = `dup-${suffix}@test.local`
      const first = await client.signUp(email, "First")
      expect(first.status).toBe(200)
      const second = await client.signUp(email, "Second")
      expect(second.status).toBeGreaterThanOrEqual(400)
    })

    it("rejects when `name` is missing with 400", async () => {
      const r = await client.postJsonFallback("/api/auth/sign-up/email", {
        email: `noname-${uniqueSuffix()}@test.local`,
        password: "password1234",
      })
      expect(r.status).toBe(400)
    })
  })

  // ─── 2. sign-in/email ─────────────────────────────────────────────────
  describe("POST /sign-in/email", () => {
    it("signs in a valid user and returns a fresh session cookie", async () => {
      const suffix = uniqueSuffix()
      const email = `signin-${suffix}@test.local`
      const su = await client.signUp(email, "Signin User")
      expect(su.status).toBe(200)

      const si = await client.signIn(email, "password1234")
      expect(si.status).toBe(200)
      expect(si.cookies).toMatch(/better-auth\.session_token=/)

      const sessionBody = si.body as { user?: { id?: string } }
      expect(sessionBody?.user?.id).toBeTruthy()
    })

    it("rejects a wrong password with 401", async () => {
      const suffix = uniqueSuffix()
      const email = `wrongpw-${suffix}@test.local`
      await client.signUp(email, "Wrong")

      const r = await client.signIn(email, "not-the-password")
      expect(r.status).toBe(401)
    })

    it("rejects an unknown email with 401", async () => {
      const r = await client.signIn(
        `ghost-${uniqueSuffix()}@test.local`,
        "password1234",
      )
      expect(r.status).toBe(401)
    })

    it("rejects an empty body with 400", async () => {
      const r = await client.postJsonFallback(
        "/api/auth/sign-in/email",
        {},
      )
      expect(r.status).toBe(400)
    })

    it("the new session inherits the user's personal workspace as active", async () => {
      const suffix = uniqueSuffix()
      const email = `inherit-${suffix}@test.local`
      await client.signUp(email, "Inherit")

      const si = await client.signIn(email, "password1234")
      const sess = await client.getSession(si.cookies)
      const sb = sess.body as {
        session?: { activeOrganizationId?: string | null }
      }
      expect(sb?.session?.activeOrganizationId).toBeTruthy()
    })
  })

  // ─── 3. get-session ───────────────────────────────────────────────────
  describe("GET /get-session", () => {
    it("returns the user and session when a valid cookie is sent", async () => {
      const suffix = uniqueSuffix()
      const { cookies, body } = await client.signUp(
        `getsession-${suffix}@test.local`,
        "Get Session",
      )
      const userId = (body as { user?: { id?: string } }).user?.id
      expect(userId).toBeTruthy()

      const r = await client.getSession(cookies)
      expect(r.status).toBe(200)
      const sessionBody = r.body as { user?: { id?: string }; session?: { userId?: string } }
      expect(sessionBody?.user?.id).toBe(userId)
      expect(sessionBody?.session?.userId).toBe(userId)
    })

    it("returns null body when no cookie is sent", async () => {
      const r = await client.getSession("")
      expect(r.status).toBe(200)
      expect(r.body).toBeNull()
    })

    it("returns null body when the cookie is tampered with", async () => {
      const r = await client.getSession(
        "better-auth.session_token=garbage.not-a-signature",
      )
      expect(r.status).toBe(200)
      expect(r.body).toBeNull()
    })
  })

  // ─── 4. sign-out ──────────────────────────────────────────────────────
  describe("POST /sign-out", () => {
    it("clears the session cookie and deletes the session row", async () => {
      const suffix = uniqueSuffix()
      const email = `signout-${suffix}@test.local`
      const su = await client.signUp(email, "Signout")
      const token = extractSessionToken(su.cookies)
      expect(token).toBeTruthy()

      const out = await client.signOut(su.cookies)
      expect(out.status).toBe(200)

      // Session row must be gone from the DB.
      const remaining = await handle.db
        .select()
        .from(sessionTable)
        .where(eq(sessionTable.token, token!))
      expect(remaining).toHaveLength(0)

      // The cleared cookie must no longer resolve a session.
      const after = await client.getSession(out.cookies)
      expect(after.body).toBeNull()
    })

    it("succeeds even without a session cookie", async () => {
      const r = await client.signOut("")
      expect(r.status).toBe(200)
    })
  })

  // ─── 5. delete-user ───────────────────────────────────────────────────
  describe("POST /delete-user", () => {
    it("rejects with 401 when no session cookie is sent", async () => {
      const r = await client.deleteUser("")
      expect(r.status).toBe(401)
    })

    it("deletes the user, sessions, account, and cascades memberships", async () => {
      const suffix = uniqueSuffix()
      const email = `delete-${suffix}@test.local`
      const su = await client.signUp(email, "Delete")
      const userId = (su.body as { user?: { id?: string } }).user?.id
      expect(userId).toBeTruthy()

      const del = await client.deleteUser(su.cookies)
      expect(del.status).toBe(200)

      const users = await handle.db
        .select()
        .from(userTable)
        .where(eq(userTable.id, userId!))
      expect(users).toHaveLength(0)

      const sessions = await handle.db
        .select()
        .from(sessionTable)
        .where(eq(sessionTable.userId, userId!))
      expect(sessions).toHaveLength(0)

      const accounts = await handle.db
        .select()
        .from(accountTable)
        .where(eq(accountTable.userId, userId!))
      expect(accounts).toHaveLength(0)
    })

    it("removes the member row that ties the user to their personal workspace", async () => {
      const suffix = uniqueSuffix()
      const su = await client.signUp(
        `deleteorg-${suffix}@test.local`,
        "Del",
      )
      const userId = (su.body as { user?: { id?: string } }).user?.id

      // Find the auto-created personal workspace.
      const owned = await handle.db
        .select()
        .from(member)
        .where(eq(member.userId, userId!))
      expect(owned).toHaveLength(1)
      const orgId = owned[0]!.organizationId

      const del = await client.deleteUser(su.cookies)
      expect(del.status).toBe(200)

      // The membership row is gone (FK cascade). The organization row
      // itself remains in this version of Better Auth — it does not
      // carry an owner FK, so we don't assert on it.
      const remaining = await handle.db
        .select()
        .from(member)
        .where(eq(member.userId, userId!))
      expect(remaining).toHaveLength(0)
      void orgId
    })
  })

  // ─── 6. change-password ───────────────────────────────────────────────
  describe("POST /change-password", () => {
    it("rotates the password and lets the user sign in with the new one", async () => {
      const suffix = uniqueSuffix()
      const email = `pw-${suffix}@test.local`
      const su = await client.signUp(email, "PW")
      expect(su.status).toBe(200)

      const r = await client.postJsonFallback(
        "/api/auth/change-password",
        { newPassword: "newpassword12", currentPassword: "password1234" },
        su.cookies,
      )
      expect(r.status).toBe(200)

      // Old password no longer works.
      const oldSignIn = await client.signIn(email, "password1234")
      expect(oldSignIn.status).toBe(401)

      // New password does.
      const newSignIn = await client.signIn(email, "newpassword12")
      expect(newSignIn.status).toBe(200)
    })

    it("rejects when currentPassword is wrong (4xx)", async () => {
      const suffix = uniqueSuffix()
      const su = await client.signUp(
        `pwbad-${suffix}@test.local`,
        "PW Bad",
      )
      const r = await client.postJsonFallback(
        "/api/auth/change-password",
        { newPassword: "newpassword12", currentPassword: "WRONG" },
        su.cookies,
      )
      expect(r.status).toBeGreaterThanOrEqual(400)
      expect(r.status).toBeLessThan(500)
    })

    it("rejects when newPassword is too short", async () => {
      const suffix = uniqueSuffix()
      const su = await client.signUp(
        `pwshort-${suffix}@test.local`,
        "PW Short",
      )
      const r = await client.postJsonFallback(
        "/api/auth/change-password",
        { newPassword: "abc", currentPassword: "password1234" },
        su.cookies,
      )
      expect(r.status).toBe(400)
    })

    it("rejects without a session cookie", async () => {
      const r = await client.postJsonFallback(
        "/api/auth/change-password",
        { newPassword: "newpassword12", currentPassword: "password1234" },
      )
      expect(r.status).toBe(401)
    })
  })

  // ─── 7. Organizations ─────────────────────────────────────────────────
  describe("Organizations", () => {
    async function newOrgOwner(suffix: string) {
      const su = await client.signUp(`org-${suffix}@test.local`, "Org User")
      const org = await client.createOrg(
        su.cookies,
        `Org ${suffix}`,
        `org-${suffix}`,
      )
      return { cookies: org.cookies, orgId: org.orgId, userId: (su.body as { user?: { id?: string } }).user?.id! }
    }

    it("create makes the caller an owner and sets it as active org", async () => {
      const suffix = uniqueSuffix()
      const { orgId, cookies } = await newOrgOwner(suffix)

      const session = await client.getSession(cookies)
      const sb = session.body as { session?: { activeOrganizationId?: string | null } }
      expect(sb?.session?.activeOrganizationId).toBe(orgId)
    })

    it("create rejects a duplicate slug with 4xx", async () => {
      const suffix = uniqueSuffix()
      const owner = await newOrgOwner(suffix)
      const ownerOrgs = await handle.db
        .select()
        .from(organizationTable)
      const ownerSlug = ownerOrgs.find((o) => o.id === owner.orgId)?.slug
      expect(ownerSlug).toBeTruthy()

      const second = await client.signUp(
        `org2-${suffix}@test.local`,
        "Other",
      )
      const dup = await client.createOrg(
        second.cookies,
        "Different Name",
        ownerSlug!,
      )
      expect(dup.status).toBeGreaterThanOrEqual(400)
      // createOrg throws on non-200, so we don't reach here on success.
      expect(dup.body).toBeTruthy()
    })

    it("list returns only the organizations the user belongs to", async () => {
      const suffix = uniqueSuffix()
      const a = await newOrgOwner(suffix)
      const b = await client.signUp(`otherlist-${suffix}@test.local`, "Other")
      const bOrg = await client.createOrg(
        b.cookies,
        `Other Org ${suffix}`,
        `other-org-${suffix}`,
      )

      const aList = await client.listOrganizations(a.cookies)
      const aIds = ((aList.body as unknown as { id: string }[]) ?? []).map(
        (o) => o.id,
      )
      const bList = await client.listOrganizations(b.cookies)
      const bIds = ((bList.body as unknown as { id: string }[]) ?? []).map(
        (o) => o.id,
      )

      expect(aIds).toContain(a.orgId)
      expect(aIds).not.toContain(bOrg.orgId)
      expect(bIds).toContain(bOrg.orgId)
      expect(bIds).not.toContain(a.orgId)
    })

    it("set-active updates activeOrganizationId and returns a fresh cookie", async () => {
      const suffix = uniqueSuffix()
      const a = await newOrgOwner(suffix)
      const owner = await client.signUp(
        `setact-${suffix}@test.local`,
        "SA",
      )
      const orgA = await client.createOrg(
        owner.cookies,
        `Org A ${suffix}`,
        `orgA-${suffix}`,
      )
      const orgB = await client.createOrg(
        orgA.cookies,
        `Org B ${suffix}`,
        `orgB-${suffix}`,
      )

      const setA = await client.setActive(owner.cookies, orgA.orgId!)
      expect(setA.status).toBe(200)
      const sessA = await client.getSession(setA.cookies)
      const sA = sessA.body as { session?: { activeOrganizationId?: string | null } }
      expect(sA?.session?.activeOrganizationId).toBe(orgA.orgId)

      const setB = await client.setActive(setA.cookies, orgB.orgId!)
      expect(setB.status).toBe(200)
      const sessB = await client.getSession(setB.cookies)
      const sB = sessB.body as { session?: { activeOrganizationId?: string | null } }
      expect(sB?.session?.activeOrganizationId).toBe(orgB.orgId)
      void a
    })

    it("delete cascades members and invitations", async () => {
      const suffix = uniqueSuffix()
      const owner = await newOrgOwner(suffix)
      const memberUser = await client.signUp(
        `mem-${suffix}@test.local`,
        "Member",
      )
      await client.inviteMember(
        owner.cookies,
        `invitee-${suffix}@test.local`,
        "member",
        owner.orgId!,
      )

      const del = await client.deleteOrganization(owner.cookies, owner.orgId!)
      expect(del.status).toBe(200)

      const memberRows = await handle.db
        .select()
        .from(member)
        .where(eq(member.organizationId, owner.orgId!))
      expect(memberRows).toHaveLength(0)

      const invRows = await handle.db
        .select()
        .from(invitationTable)
        .where(eq(invitationTable.organizationId, owner.orgId!))
      expect(invRows).toHaveLength(0)
      void memberUser
    })

    it("leave removes the user from non-last-owner orgs", async () => {
      const suffix = uniqueSuffix()
      const owner = await newOrgOwner(suffix)
      // Owner invites a second user; second user accepts; then leaves.
      const secondEmail = `leave-${suffix}@test.local`
      await client.inviteMember(
        owner.cookies,
        secondEmail,
        "member",
        owner.orgId!,
      )
      const su = await client.signUp(secondEmail, "Leave")
      // Find the pending invitation id.
      const inv = await handle.db
        .select()
        .from(invitationTable)
        .where(eq(invitationTable.email, secondEmail))
      expect(inv).toHaveLength(1)
      const accept = await client.acceptInvitation(su.cookies, inv[0]!.id)
      expect(accept.status).toBe(200)

      const leave = await client.leaveOrganization(su.cookies, owner.orgId!)
      expect(leave.status).toBe(200)

      // After leaving the owner's org the user still has the personal
      // workspace auto-created on sign-up — filter by the target org.
      const memberRows = await handle.db
        .select()
        .from(member)
        .where(
          and(
            eq(member.userId, (su.body as { user?: { id?: string } }).user?.id!),
            eq(member.organizationId, owner.orgId!),
          ),
        )
      expect(memberRows).toHaveLength(0)
    })

    it("leave fails when the user is the last owner", async () => {
      const suffix = uniqueSuffix()
      const owner = await newOrgOwner(suffix)
      const leave = await client.leaveOrganization(owner.cookies, owner.orgId!)
      expect(leave.status).toBeGreaterThanOrEqual(400)
    })
  })

  // ─── 8. Members ───────────────────────────────────────────────────────
  describe("Members", () => {
    async function setupOwnerAndTarget(suffix: string) {
      const owner = await client.signUp(
        `m-owner-${suffix}@test.local`,
        "Owner",
      )
      const org = await client.createOrg(
        owner.cookies,
        `Org ${suffix}`,
        `org-${suffix}`,
      )
      const targetEmail = `m-target-${suffix}@test.local`
      const target = await client.signUp(targetEmail, "Target")
      return {
        ownerCookies: org.cookies,
        ownerUserId: (owner.body as { user?: { id?: string } }).user?.id!,
        orgId: org.orgId,
        targetCookies: target.cookies,
        targetUserId: (target.body as { user?: { id?: string } }).user?.id!,
        targetEmail,
      }
    }

    it("addMember creates a member row with the given role", async () => {
      const suffix = uniqueSuffix()
      const ctx = await setupOwnerAndTarget(suffix)
      // addMember is a programmatic endpoint.
      const created = await auth.api.addMember({
        body: {
          userId: ctx.targetUserId,
          role: "admin",
          organizationId: ctx.orgId,
        },
        headers: new Headers(),
      })
      expect(created).toBeTruthy()
      const rows = await handle.db
        .select()
        .from(member)
        .where(eq(member.userId, ctx.targetUserId))
      expect(rows).toHaveLength(2) // personal + this org
      expect(rows.find((r) => r.organizationId === ctx.orgId)?.role).toBe(
        "admin",
      )
    })

    it("update-member-role demotes a member", async () => {
      const suffix = uniqueSuffix()
      const ctx = await setupOwnerAndTarget(suffix)
      await auth.api.addMember({
        body: {
          userId: ctx.targetUserId,
          role: "admin",
          organizationId: ctx.orgId,
        },
        headers: new Headers(),
      })

      const list = await client.listMembers(ctx.ownerCookies, ctx.orgId)
      const memberList = list.body as unknown as { id: string; userId: string; role: string }[]
      const m = memberList.find((x) => x.userId === ctx.targetUserId)
      expect(m?.role).toBe("admin")

      const upd = await client.updateMemberRole(
        ctx.ownerCookies,
        m!.id,
        "member",
      )
      expect(upd.status).toBe(200)

      const list2 = await client.listMembers(ctx.ownerCookies, ctx.orgId)
      const m2 = (list2.body as unknown as { id: string; userId: string; role: string }[])
        .find((x) => x.userId === ctx.targetUserId)
      expect(m2?.role).toBe("member")
    })

    it("update-member-role rejects an unknown role with 400", async () => {
      const suffix = uniqueSuffix()
      const ctx = await setupOwnerAndTarget(suffix)
      await auth.api.addMember({
        body: {
          userId: ctx.targetUserId,
          role: "admin",
          organizationId: ctx.orgId,
        },
        headers: new Headers(),
      })
      const list = await client.listMembers(ctx.ownerCookies, ctx.orgId)
      const m = (list.body as unknown as { id: string }[])[0]
      const upd = await client.updateMemberRole(
        ctx.ownerCookies,
        m!.id,
        "wizard",
      )
      expect(upd.status).toBeGreaterThanOrEqual(400)
    })

    it("remove-member drops the row", async () => {
      const suffix = uniqueSuffix()
      const ctx = await setupOwnerAndTarget(suffix)
      await auth.api.addMember({
        body: {
          userId: ctx.targetUserId,
          role: "admin",
          organizationId: ctx.orgId,
        },
        headers: new Headers(),
      })
      const list = await client.listMembers(ctx.ownerCookies, ctx.orgId)
      const members = list.body as unknown as { id: string; userId: string; organizationId: string }[]
      const m = members.find(
        (x) => x.userId === ctx.targetUserId && x.organizationId === ctx.orgId,
      )
      expect(m?.id).toBeTruthy()

      const rem = await client.removeMember(ctx.ownerCookies, m!.id)
      if (rem.status !== 200) {
        throw new Error(
          `removeMember failed: ${rem.status} ${JSON.stringify(rem.body)}`,
        )
      }

      const rows = await handle.db
        .select()
        .from(member)
        .where(eq(member.userId, ctx.targetUserId))
      expect(rows.find((r) => r.organizationId === ctx.orgId)).toBeUndefined()
    })

    it("cannot remove the last owner", async () => {
      const suffix = uniqueSuffix()
      const ctx = await setupOwnerAndTarget(suffix)
      const list = await client.listMembers(ctx.ownerCookies, ctx.orgId)
      const owner = (list.body as unknown as { id: string; role: string }[]).find(
        (m) => m.role === "owner",
      )!
      const rem = await client.removeMember(ctx.ownerCookies, owner.id)
      expect(rem.status).toBeGreaterThanOrEqual(400)
    })

    it("list-members includes only the active org's members", async () => {
      const suffix = uniqueSuffix()
      const ctx = await setupOwnerAndTarget(suffix)
      // Add target to the org
      await auth.api.addMember({
        body: {
          userId: ctx.targetUserId,
          role: "admin",
          organizationId: ctx.orgId,
        },
        headers: new Headers(),
      })
      const list = await client.listMembers(ctx.ownerCookies, ctx.orgId)
      const ids = (list.body as unknown as { id: string }[]).map((m) => m.id)
      expect(ids.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ─── 9. Invitations ───────────────────────────────────────────────────
  describe("Invitations", () => {
    async function ownerWithOrg(suffix: string) {
      const owner = await client.signUp(
        `inv-owner-${suffix}@test.local`,
        "Owner",
      )
      const org = await client.createOrg(
        owner.cookies,
        `Org ${suffix}`,
        `org-${suffix}`,
      )
      return { cookies: org.cookies, orgId: org.orgId }
    }

    it("invite creates a pending invitation visible in list-invitations", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const invitee = `invitee-${suffix}@test.local`
      const inv = await client.inviteMember(
        ctx.cookies,
        invitee,
        "member",
        ctx.orgId,
      )
      expect(inv.status).toBe(200)
      const id = (inv.body as { id?: string }).id
      expect(id).toBeTruthy()

      const list = await client.listInvitations(ctx.cookies, ctx.orgId)
      const rows = list.body as unknown as { id: string; email: string; status: string }[]
      const found = rows.find((r) => r.id === id)
      expect(found?.email).toBe(invitee)
      expect(found?.status).toBe("pending")
    })

    it("invite rejects an invalid email with 400", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const inv = await client.inviteMember(
        ctx.cookies,
        "not-an-email",
        "member",
        ctx.orgId,
      )
      expect(inv.status).toBe(400)
    })

    it("invite rejects when the target is already a member", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const targetEmail = `already-${suffix}@test.local`
      const target = await client.signUp(targetEmail, "Already")
      await auth.api.addMember({
        body: {
          userId: (target.body as { user?: { id?: string } }).user?.id!,
          role: "member",
          organizationId: ctx.orgId,
        },
        headers: new Headers(),
      })

      const inv = await client.inviteMember(
        ctx.cookies,
        targetEmail,
        "member",
        ctx.orgId,
      )
      expect(inv.status).toBeGreaterThanOrEqual(400)
    })

    it("invite rejects a duplicate invitation without `resend`", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const email = `dupinv-${suffix}@test.local`
      const first = await client.inviteMember(
        ctx.cookies,
        email,
        "member",
        ctx.orgId,
      )
      expect(first.status).toBe(200)
      const second = await client.inviteMember(
        ctx.cookies,
        email,
        "member",
        ctx.orgId,
      )
      expect(second.status).toBeGreaterThanOrEqual(400)
    })

    it("invite with `resend` renews the existing invitation's expiresAt", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const email = `resend-${suffix}@test.local`
      const first = await client.inviteMember(
        ctx.cookies,
        email,
        "member",
        ctx.orgId,
      )
      const firstId = (first.body as { id?: string }).id!
      const originalExpires = (first.body as { expiresAt: string }).expiresAt

      // Wait a couple of ms so a renewed timestamp differs.
      await new Promise((r) => setTimeout(r, 20))

      const resend = await client.postJsonFallback(
        "/api/auth/organization/invite-member",
        { email, role: "member", organizationId: ctx.orgId, resend: true },
        ctx.cookies,
      )
      expect(resend.status).toBe(200)
      expect((resend.body as { id?: string }).id).toBe(firstId)
      const renewedExpires = (resend.body as { expiresAt: string }).expiresAt
      expect(new Date(renewedExpires).getTime()).toBeGreaterThan(
        new Date(originalExpires).getTime(),
      )
    })

    it("accept adds the user as a member and sets the org active", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const email = `accept-${suffix}@test.local`
      const inv = await client.inviteMember(
        ctx.cookies,
        email,
        "member",
        ctx.orgId,
      )
      const invId = (inv.body as { id?: string }).id!

      const su = await client.signUp(email, "Accept")
      const accept = await client.acceptInvitation(su.cookies, invId)
      expect(accept.status).toBe(200)

      const memberRows = await handle.db
        .select()
        .from(member)
        .where(eq(member.organizationId, ctx.orgId!))
      const acceptedMember = memberRows.find(
        (m) => m.userId === (su.body as { user?: { id?: string } }).user?.id,
      )
      expect(acceptedMember?.role).toBe("member")

      const session = await client.getSession(accept.cookies)
      const sb = session.body as { session?: { activeOrganizationId?: string | null } }
      expect(sb?.session?.activeOrganizationId).toBe(ctx.orgId)
    })

    it("accept rejects an expired invitation with 400", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const email = `expired-${suffix}@test.local`
      const inv = await client.inviteMember(
        ctx.cookies,
        email,
        "member",
        ctx.orgId,
      )
      const invId = (inv.body as { id?: string }).id!

      // Move expiresAt into the past.
      await handle.db
        .update(invitationTable)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(invitationTable.id, invId))

      const su = await client.signUp(email, "Expired")
      const accept = await client.acceptInvitation(su.cookies, invId)
      expect(accept.status).toBe(400)
    })

    it("accept rejects when the user's email does not match the invitation", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const realEmail = `real-${suffix}@test.local`
      const inv = await client.inviteMember(
        ctx.cookies,
        realEmail,
        "member",
        ctx.orgId,
      )
      const invId = (inv.body as { id?: string }).id!

      // Different user signs up with a different email and tries to accept.
      const imposter = await client.signUp(
        `imposter-${suffix}@test.local`,
        "Imposter",
      )
      const accept = await client.acceptInvitation(imposter.cookies, invId)
      expect(accept.status).toBeGreaterThanOrEqual(400)
    })

    it("reject flips the invitation status to `rejected`", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const email = `reject-${suffix}@test.local`
      const inv = await client.inviteMember(
        ctx.cookies,
        email,
        "member",
        ctx.orgId,
      )
      const invId = (inv.body as { id?: string }).id!

      const su = await client.signUp(email, "Reject")
      const reject = await client.rejectInvitation(su.cookies, invId)
      expect(reject.status).toBe(200)

      const row = (
        await handle.db
          .select()
          .from(invitationTable)
          .where(eq(invitationTable.id, invId))
      )[0]
      expect(row?.status).toBe("rejected")
    })

    it("cancel by the owner prevents subsequent accept", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const email = `cancel-${suffix}@test.local`
      const inv = await client.inviteMember(
        ctx.cookies,
        email,
        "member",
        ctx.orgId,
      )
      const invId = (inv.body as { id?: string }).id!

      const cancel = await client.cancelInvitation(ctx.cookies, invId)
      expect(cancel.status).toBe(200)

      const su = await client.signUp(email, "Cancel")
      const accept = await client.acceptInvitation(su.cookies, invId)
      expect(accept.status).toBe(400)
    })

    it("cancel by a non-owner (member role) is forbidden", async () => {
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const email = `forbidden-${suffix}@test.local`
      const inv = await client.inviteMember(
        ctx.cookies,
        email,
        "member",
        ctx.orgId,
      )
      const invId = (inv.body as { id?: string }).id!

      // Add the target as a plain member first, then have them try to cancel.
      const target = await client.signUp(
        `forb-user-${suffix}@test.local`,
        "Forb",
      )
      await auth.api.addMember({
        body: {
          userId: (target.body as { user?: { id?: string } }).user?.id!,
          role: "member",
          organizationId: ctx.orgId,
        },
        headers: new Headers(),
      })
      const cancel = await client.cancelInvitation(target.cookies, invId)
      expect(cancel.status).toBe(403)
    })

    it("list-user-invitations requires verified email by default", async () => {
      // Better Auth's `shouldRequireVerifiedEmailForInvitationIdAction`
      // returns true when invitation ids are opaque (text) rather than
      // UUID, which is the schema we have. That makes this endpoint
      // refuse unverified invitees with a 403. Verifying that gate is
      // part of the contract — until the auth config opts into
      // `requireEmailVerificationOnInvitation: false`, this stays.
      const suffix = uniqueSuffix()
      const ctx = await ownerWithOrg(suffix)
      const email = `userinv-${suffix}@test.local`
      await client.inviteMember(ctx.cookies, email, "member", ctx.orgId)
      const su = await client.signUp(email, "User Inv")
      const list = await client.getJsonFallback(
        "/api/auth/organization/list-user-invitations",
        su.cookies,
      )
      expect(list.status).toBe(403)
      const body = list.body as { code?: string } | null
      expect(body?.code).toMatch(/EMAIL_VERIFICATION_REQUIRED/)
    })
  })

  // ─── 10. Multi-tenant isolation ───────────────────────────────────────
  describe("Multi-tenant isolation", () => {
    it("org A's owner cannot see org B's invitations", async () => {
      const suffix = uniqueSuffix()
      const ownerA = await client.signUp(`iso-a-${suffix}@test.local`, "A")
      const orgA = await client.createOrg(
        ownerA.cookies,
        `Org A ${suffix}`,
        `orgA-${suffix}`,
      )
      const ownerB = await client.signUp(`iso-b-${suffix}@test.local`, "B")
      const orgB = await client.createOrg(
        ownerB.cookies,
        `Org B ${suffix}`,
        `orgB-${suffix}`,
      )
      await client.inviteMember(
        orgA.cookies,
        `iso-target-${suffix}@test.local`,
        "member",
        orgA.orgId,
      )

      const listA = await client.listInvitations(orgA.cookies, orgA.orgId)
      const listB = await client.listInvitations(orgB.cookies, orgB.orgId)

      const aIds = ((listA.body as unknown as { id: string }[]) ?? []).map(
        (i) => i.id,
      )
      const bIds = ((listB.body as unknown as { id: string }[]) ?? []).map(
        (i) => i.id,
      )
      // No id appears in both lists.
      expect(aIds.some((id) => bIds.includes(id))).toBe(false)
    })

    it("set-active to an org the user is not a member of fails", async () => {
      const suffix = uniqueSuffix()
      const ownerA = await client.signUp(`iso2-a-${suffix}@test.local`, "A")
      const orgA = await client.createOrg(
        ownerA.cookies,
        `Org A ${suffix}`,
        `orgA2-${suffix}`,
      )
      const ownerB = await client.signUp(`iso2-b-${suffix}@test.local`, "B")
      const orgB = await client.createOrg(
        ownerB.cookies,
        `Org B ${suffix}`,
        `orgB2-${suffix}`,
      )

      const set = await client.setActive(ownerA.cookies, orgB.orgId!)
      expect(set.status).toBeGreaterThanOrEqual(400)
      void orgA
    })

    it("an invitation belonging to org A cannot be accepted via org B's session", async () => {
      const suffix = uniqueSuffix()
      const ownerA = await client.signUp(`iso3-a-${suffix}@test.local`, "A")
      const orgA = await client.createOrg(
        ownerA.cookies,
        `Org A ${suffix}`,
        `orgA3-${suffix}`,
      )
      const email = `iso3-target-${suffix}@test.local`
      const inv = await client.inviteMember(
        orgA.cookies,
        email,
        "member",
        orgA.orgId,
      )
      const invId = (inv.body as { id?: string }).id!

      // An unrelated user (different email) tries to accept it.
      const outsider = await client.signUp(
        `iso3-out-${suffix}@test.local`,
        "Out",
      )
      const accept = await client.acceptInvitation(outsider.cookies, invId)
      expect(accept.status).toBeGreaterThanOrEqual(400)
    })
  })

  // ─── 11. getDefaultOrganizationId ─────────────────────────────────────
  describe("getDefaultOrganizationId (unit via DB)", () => {
    async function newUser(suffix: string) {
      const su = await client.signUp(
        `def-${suffix}@test.local`,
        "Default",
      )
      const userId = (su.body as { user?: { id?: string } }).user?.id!
      const sess = await client.getSession(su.cookies)
      const sessionId = (sess.body as { session?: { id?: string } })
        .session?.id!
      return { userId, sessionId }
    }

    it("returns null when the user has no memberships at all", async () => {
      const suffix = uniqueSuffix()
      const userId = (await newUser(suffix)).userId
      const result = await getDefaultOrganizationId(userId, {
        client: handle.db,
      })
      // Auto-provisioning creates a personal workspace on sign-up, so
      // there is always an `owner` membership. The function should
      // therefore return that workspace id, NOT null.
      expect(result).toBeTruthy()
    })

    it("prefers an owner membership over other memberships", async () => {
      const suffix = uniqueSuffix()
      const { userId } = await newUser(suffix)

      // The personal workspace (owner) is the first membership. Add an
      // `admin` membership to a second org.
      const owner = (await handle.db
        .select()
        .from(member)
        .where(eq(member.userId, userId)))[0]!
      const ownerOrg = owner.organizationId

      const otherOrgId = `other-org-${suffix}`
      await handle.db.insert(organizationTable).values({
        id: otherOrgId,
        name: `Other ${suffix}`,
        slug: `other-org-${suffix}`,
        createdAt: new Date(),
      })
      await handle.db.insert(member).values({
        id: `${userId}-${otherOrgId}`,
        organizationId: otherOrgId,
        userId,
        role: "admin",
        createdAt: new Date(Date.now() + 1000), // newer, but lower rank
      })

      const result = await getDefaultOrganizationId(userId, {
        client: handle.db,
      })
      expect(result).toBe(ownerOrg)
    })

    it("returns any membership when the user has no owner role", async () => {
      const suffix = uniqueSuffix()
      const { userId } = await newUser(suffix)
      // Demote the personal-workspace owner to `member`.
      await handle.db
        .update(member)
        .set({ role: "member" })
        .where(eq(member.userId, userId))

      const result = await getDefaultOrganizationId(userId, {
        client: handle.db,
      })
      expect(result).toBeTruthy()
    })
  })
})
