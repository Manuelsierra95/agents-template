"use client"

import { createContext, useContext, type ReactNode } from "react"
import { authClient } from "@/lib/auth/client"

/**
 * Session context — exposes Better Auth's reactive session state to the
 * React tree without forcing every consumer to call `authClient.useSession`
 * independently.
 *
 * `useSession()` from Better Auth is a nanostore-backed hook. Re-fetching
 * after `signIn` / `signOut` / `setActiveOrganization` is automatic — we
 * simply pass the atom-derived values through context for ergonomics.
 *
 * Consumers in this app should prefer the small `useSession()` re-export
 * below rather than re-implementing auth state.
 */

type SessionUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
}

type SessionRecord = {
  id: string
  token: string
  userId: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
  ipAddress: string | null
  userAgent: string | null
  activeOrganizationId: string | null
}

export type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; user: SessionUser; session: SessionRecord }
  | { status: "unauthenticated" }

const SessionContext = createContext<SessionState | null>(null)

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const { data, isPending, error } = authClient.useSession()

  let value: SessionState
  if (isPending) {
    value = { status: "loading" }
  } else if (error || !data) {
    value = { status: "unauthenticated" }
  } else {
    value = {
      status: "authenticated",
      user: data.user as SessionUser,
      session: data.session as SessionRecord,
    }
  }

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error("useSession must be used inside <AuthSessionProvider>")
  }
  return ctx
}