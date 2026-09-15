import "server-only"
import { cache } from "react"
import { serverApiFetch } from "@/lib/api/server"
import type { AppMe } from "@/lib/api/types"

/**
 * Server-side session helpers.
 *
 * These talk to Better Auth's `/api/auth/get-session` endpoint over
 * HTTP from a Server Component. The session cookie is read from
 * `next/headers()` and forwarded via `serverApiFetch`, which keeps
 * the `apps/web → apps/api` boundary intact (no DB credentials leak
 * into the web bundle).
 *
 * The React `cache` wrapper deduplicates concurrent calls inside a
 * single request — the layout and a child page can both ask for the
 * session and only one HTTP round-trip happens.
 */

export type ServerSessionUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  image: string | null
  createdAt: string
  updatedAt: string
}

export type ServerSessionRecord = {
  id: string
  token: string
  userId: string
  expiresAt: string
  createdAt: string
  updatedAt: string
  ipAddress: string | null
  userAgent: string | null
  activeOrganizationId: string | null
}

export type ServerSession =
  | { user: ServerSessionUser; session: ServerSessionRecord }
  | null

type BetterAuthSessionResponse = {
  user?: ServerSessionUser
  session?: ServerSessionRecord
} | null

export const getServerSession = cache(async (): Promise<ServerSession> => {
  try {
    const res = await serverApiFetch<BetterAuthSessionResponse>(
      "/api/auth/get-session",
    )
    if (!res || !res.user || !res.session) return null
    return { user: res.user, session: res.session }
  } catch {
    return null
  }
})

/**
 * Authenticated "me" envelope — the dashboard layout needs the
 * current workspace name to render the sidebar's workspace switcher.
 * Returns `null` when there is no session (the layout treats that as
 * an unauthenticated request and redirects to `/login`).
 */
export const getServerMe = cache(async (): Promise<AppMe | null> => {
  try {
    return await serverApiFetch<AppMe>("/api/me")
  } catch {
    return null
  }
})