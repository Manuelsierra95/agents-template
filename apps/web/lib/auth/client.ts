import { createAuthClient } from "better-auth/react"
import type { createAuthClient as createAuthClientReact } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"

type BetterAuthReactClient = ReturnType<typeof createAuthClientReact>

/**
 * Better Auth React client.
 *
 * Uses relative URLs so that `/api/auth/*` is served by the Next.js
 * rewrite that proxies to the Hono API. This keeps the browser and
 * the API on the same origin, which is required for `SameSite=Lax`
 * session cookies to be sent on the fetch that follows sign-in /
 * sign-up.
 *
 * Session state lives in nanostores inside Better Auth's `useStore`
 * and re-hydrates automatically after sign-in/sign-out/setActive.
 */
const baseURL =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? ""
    : "" // Browser → use relative URLs through the Next.js rewrite.

export const authClient: BetterAuthReactClient = createAuthClient({
  baseURL,
  plugins: [organizationClient()],
})

export type AuthClient = BetterAuthReactClient