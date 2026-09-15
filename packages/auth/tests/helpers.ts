import { Hono } from "hono"
import type { DbHandle } from "@workspace/db"
import type { Auth } from "@workspace/auth"

/**
 * Shared test helpers for the @workspace/auth test suite.
 *
 * Three jobs:
 *   - Cookie plumbing — extract/merge Set-Cookie headers from Better Auth
 *     responses so subsequent requests carry the right session.
 *   - `AuthClient` — a thin wrapper around `auth.handler` that exposes
 *     `signUp`, `signIn`, `createOrg`, `setActive`, `inviteMember`,
 *     `acceptInvitation`, etc. Each call returns the new `Cookie:` value
 *     the next request should send.
 *   - DB lifecycle — `resetDb` truncates every auth-related table so
 *     each `describe` starts from a known state, and `uniqueSuffix`
 *     returns a string that no other test in this run will collide with.
 *
 * These helpers are deliberately small. Behavioural assertions live next
 * to the tests that exercise them, not here.
 */

export const TEST_ORIGIN = "http://localhost:4000"

export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function extractCookies(res: Response): string[] {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(res.headers)
  }
  const single = res.headers.get("set-cookie")
  return single ? [single] : []
}

export function mergeCookies(...sources: (string | undefined)[]): string {
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

export function extractSessionToken(cookies: string): string | null {
  const map = new Map<string, string>()
  for (const pair of cookies.split(/;\s*/)) {
    const eq = pair.indexOf("=")
    if (eq <= 0) continue
    map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
  for (const key of ["better-auth.session_token", "session_token"]) {
    const raw = map.get(key)
    if (!raw) continue
    const decoded = decodeURIComponent(raw)
    const dot = decoded.indexOf(".")
    return dot > 0 ? decoded.slice(0, dot) : decoded
  }
  return null
}

/**
 * Truncate every auth-related table. Order matters — child tables
 * before their parents — and `RESTART IDENTITY CASCADE` drops the
 * dependent rows automatically.
 */
export async function resetDb(handle: DbHandle): Promise<void> {
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

type AuthInstance = Auth

export type AuthClient = {
  signUp: (
    email: string,
    name: string,
    password?: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  signIn: (
    email: string,
    password?: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  signOut: (cookies: string) => Promise<{ cookies: string; status: number; body: unknown }>
  getSession: (
    cookies: string,
  ) => Promise<{ status: number; body: unknown }>
  createOrg: (
    cookies: string,
    name: string,
    slug: string,
  ) => Promise<{ orgId: string | undefined; cookies: string; status: number; body: unknown }>
  setActive: (
    cookies: string,
    organizationId: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  deleteUser: (
    cookies: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  inviteMember: (
    cookies: string,
    email: string,
    role: string,
    organizationId?: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  acceptInvitation: (
    cookies: string,
    invitationId: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  rejectInvitation: (
    cookies: string,
    invitationId: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  cancelInvitation: (
    cookies: string,
    invitationId: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  listInvitations: (
    cookies: string,
    organizationId?: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  listMembers: (
    cookies: string,
    organizationId?: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  listOrganizations: (
    cookies: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  updateMemberRole: (
    cookies: string,
    memberId: string,
    role: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  removeMember: (
    cookies: string,
    memberIdOrEmail: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  deleteOrganization: (
    cookies: string,
    organizationId: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  leaveOrganization: (
    cookies: string,
    organizationId: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  /**
   * Generic POST helper used by a few tests that hit endpoints not
   * modelled above (e.g. invite-member with `resend`). Keeps the test
   * file honest about the request shape without bloating the typed
   * surface.
   */
  postJsonFallback: (
    path: string,
    body: unknown,
    cookies?: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
  /**
   * Generic GET helper for endpoints not modelled above (e.g.
   * list-user-invitations). Returns the raw JSON body.
   */
  getJsonFallback: (
    path: string,
    cookies?: string,
  ) => Promise<{ cookies: string; status: number; body: unknown }>
}

export function buildAuthClient(auth: AuthInstance): AuthClient {
  const authApp: Hono = new Hono()
  authApp.on(["POST", "GET", "DELETE"], "/api/auth/*", (c) => auth.handler(c.req.raw))

  async function postJson(
    path: string,
    body: unknown,
    cookies?: string,
  ): Promise<{
    status: number
    cookies: string
    body: unknown
  }> {
    const res = await authApp.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: TEST_ORIGIN,
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: JSON.stringify(body ?? {}),
    })
    const setCookies = extractCookies(res)
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
    path: string,
    cookies?: string,
  ): Promise<{ cookies: string; status: number; body: unknown }> {
    const res = await authApp.request(path, {
      method: "GET",
      headers: {
        Origin: TEST_ORIGIN,
        ...(cookies ? { Cookie: cookies } : {}),
      },
    })
    const json = res.headers.get("content-type")?.includes("json")
      ? await res.json()
      : null
    return {
      status: res.status,
      cookies: mergeCookies(cookies, extractCookies(res).join("; ")),
      body: json,
    }
  }

  return {
    async signUp(email, name, password = "password1234") {
      return postJson("/api/auth/sign-up/email", { email, password, name })
    },
    async signIn(email, password = "password1234") {
      return postJson("/api/auth/sign-in/email", { email, password })
    },
    async signOut(cookies) {
      const res = await authApp.request("/api/auth/sign-out", {
        method: "POST",
        headers: {
          Origin: TEST_ORIGIN,
          Cookie: cookies,
        },
      })
      return {
        status: res.status,
        cookies: mergeCookies(cookies, extractCookies(res).join("; ")),
        body: res.headers.get("content-type")?.includes("json")
          ? await res.json()
          : null,
      }
    },
    async getSession(cookies) {
      return getJson("/api/auth/get-session", cookies)
    },
    async createOrg(cookies, name, slug) {
      const r = await postJson(
        "/api/auth/organization/create",
        { name, slug },
        cookies,
      )
      // Don't throw on 4xx — tests want to assert on status. The caller
      // can check `status` and read `body` to assert on the error code.
      const body = r.body as { id?: string } | { data?: { id?: string } } | null
      const orgId: string | undefined =
        (body as { id?: string } | null)?.id ??
        (body as { data?: { id?: string } } | null)?.data?.id
      return { orgId, cookies: r.cookies, status: r.status, body: r.body }
    },
    async setActive(cookies, organizationId) {
      return postJson(
        "/api/auth/organization/set-active",
        { organizationId },
        cookies,
      )
    },
    async deleteUser(cookies) {
      return postJson("/api/auth/delete-user", {}, cookies)
    },
    async inviteMember(cookies, email, role, organizationId) {
      return postJson(
        "/api/auth/organization/invite-member",
        { email, role, ...(organizationId ? { organizationId } : {}) },
        cookies,
      )
    },
    async acceptInvitation(cookies, invitationId) {
      return postJson(
        "/api/auth/organization/accept-invitation",
        { invitationId },
        cookies,
      )
    },
    async rejectInvitation(cookies, invitationId) {
      return postJson(
        "/api/auth/organization/reject-invitation",
        { invitationId },
        cookies,
      )
    },
    async cancelInvitation(cookies, invitationId) {
      return postJson(
        "/api/auth/organization/cancel-invitation",
        { invitationId },
        cookies,
      )
    },
    async listInvitations(cookies, organizationId) {
      const qs = organizationId
        ? `?organizationId=${encodeURIComponent(organizationId)}`
        : ""
      return getJson(
        `/api/auth/organization/list-invitations${qs}`,
        cookies,
      ) as Promise<{ cookies: string; status: number; body: any }>
    },
    async listMembers(cookies, organizationId) {
      const qs = organizationId
        ? `?organizationId=${encodeURIComponent(organizationId)}`
        : ""
      const r = await getJson(
        `/api/auth/organization/list-members${qs}`,
        cookies,
      )
      // Better Auth wraps the array: { members: [...], total: N }.
      const wrapped = r.body as { members?: unknown[] } | null
      const unwrapped = wrapped?.members ?? r.body
      return { ...r, body: unwrapped }
    },
    async updateMemberRole(cookies, memberId, role) {
      return postJson(
        "/api/auth/organization/update-member-role",
        { memberId, role },
        cookies,
      )
    },
    async removeMember(cookies, memberIdOrEmail) {
      return postJson(
        "/api/auth/organization/remove-member",
        { memberIdOrEmail },
        cookies,
      )
    },
    async deleteOrganization(cookies, organizationId) {
      return postJson(
        "/api/auth/organization/delete",
        { organizationId },
        cookies,
      )
    },
    async leaveOrganization(cookies, organizationId) {
      return postJson(
        "/api/auth/organization/leave",
        { organizationId },
        cookies,
      )
    },
    async listOrganizations(cookies) {
      return getJson("/api/auth/organization/list", cookies)
    },
    async postJsonFallback(path, body, cookies) {
      return postJson(path, body, cookies)
    },
    /**
     * Generic GET helper for endpoints not modelled above (e.g.
     * list-user-invitations). Returns the raw JSON body.
     */
    async getJsonFallback(path, cookies) {
      return getJson(path, cookies)
    },
  }
}
