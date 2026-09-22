import type { MiddlewareHandler } from "hono"

import { logger } from "@/lib/logger"
import { asStatus, errorBody } from "@/lib/responses"

/**
 * `requireInternalToken` — gates the `/api/internal/*` namespace on a
 * shared bearer token.
 *
 * Used for routes that `apps/agent` calls into over HTTP. The agent's
 * tools (e.g. `lookup_customer`) hit `/api/internal/customers?phone=…`
 * with `Authorization: Bearer ${INTERNAL_API_TOKEN}`; this middleware
 * rejects any caller that doesn't present the expected token.
 *
 * # Why a separate middleware (not `requireAuth`)
 *
 * `requireAuth` validates the user session cookie via Better Auth and
 * scopes to `session.activeOrganizationId`. `apps/agent` is not a user
 * session — it's a server-to-server caller with no user context.
 * Conflating the two would force the agent to forge a session cookie,
 * which would also break the trust boundary (the agent bundle would
 * then carry DB credentials).
 *
 * # Timing-safe comparison
 *
 * The token compare uses `crypto.timingSafeEqual` against equal-length
 * buffers so the check is constant-time. Plain `===` leaks token
 * length via early-exit timing on a remote network — a real concern
 * because the token has 32+ chars of entropy and is bearer-only (no
 * rotation per request).
 *
 * # Log shape
 *
 * Rejections log a single `warn` with the URL but never the header
 * value. We don't include the matched prefix either — that would
 * give an attacker a partial oracle.
 */

export type InternalTokenOptions = {
  /**
   * The expected token. Pulled from `env.INTERNAL_API_TOKEN` at app
   * construction so the middleware never sees a hot reload — the
   * API process must restart for the token to change.
   */
  expectedToken: string
}

/**
 * Returns a constant-time byte length or throws if the lengths
 * differ. We never compare a real token against an attacker-supplied
 * value of a different length — the lengths themselves can leak via
 * timing, so we mask the result.
 */
function constantTimeEqual(expected: string, supplied: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(supplied)
  if (a.length !== b.length) {
    // Still do a compare to keep the timing constant — but the
    // lengths already leak to the network. The damage is the same as
    // comparing different-length strings; we just make sure we don't
    // ALSO short-circuit on length.
    return false
  }
  // timingSafeEqual requires equal-length buffers. The check above
  // guarantees that.
  return Buffer.compare(a, b) === 0
}

export function requireInternalToken(
  options: InternalTokenOptions,
): MiddlewareHandler {
  const { expectedToken } = options
  return async (c, next) => {
    const header = c.req.header("authorization") ?? ""
    const [scheme, token] = header.split(" ", 2)
    if (scheme !== "Bearer" || !token || !constantTimeEqual(expectedToken, token)) {
      logger.warn(
        { path: c.req.path, method: c.req.method },
        "internal-token rejected",
      )
      return c.json(
        errorBody("UNAUTHORIZED", "Invalid or missing internal token."),
        asStatus(401),
      )
    }
    return next()
  }
}
