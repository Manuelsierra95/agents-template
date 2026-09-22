import { Hono } from "hono"

import { logger } from "@/lib/logger"
import { errorBody, asStatus } from "@/lib/responses"

/**
 * `apps/api` ↔ `apps/agent` proxy.
 *
 * Mounts at `/eve/*` and pass-throughs every method to
 * `${agentUrl}/eve/*`. Used by `apps/web` (via the Next.js rewrite
 * `/eve/:path* → ${API_URL}/eve/:path*`) to reach the Eve runtime
 * without exposing its port to the browser.
 *
 * # Auth contract
 *
 * apps/api is the only legitimate caller of `/eve/*`. To make that
 * enforceable at Eve (which has no per-route auth of its own), the
 * proxy injects `Authorization: Bearer ${internalToken}` on every
 * upstream request. Eve reads the token via `eveDevArguments` /
 * `ctx.session.auth` to decide which sessions belong to the API
 * gateway (vs. a direct web client — Phase 2F).
 *
 * # Streaming pass-through
 *
 * Eve streams NDJSON over a chunked HTTP response
 * (`GET /eve/v1/session/:id/stream`). We forward the upstream
 * `ReadableStream` as the response body unchanged — Hono does not
 * buffer it. The browser sees Eve's chunks arrive in the same order
 * and timing the agent produced them.
 *
 * # Headers
 *
 * Hop-by-hop headers (`Host`, `Connection`, `Keep-Alive`,
 * `Transfer-Encoding`, `Content-Length`) are stripped because they
 * belong to the apps/api↔upstream hop, not the apps/web↔apps/api hop.
 * `Cookie` is stripped because the agent should not see the browser's
 * Better Auth session — apps/api is the trust boundary, not apps/agent.
 *
 * # Failure modes
 *
 * - Eve is down → `fetch` throws → we return 502 with a typed error
 *   envelope. The browser sees a real status, not a confusing
 *   `TypeError`.
 * - Eve returns 4xx/5xx → we forward the status unchanged (Eve's error
 *   semantics are its own).
 */

export type AgentProxyOptions = {
  /**
   * Where Eve listens. The path on the request is appended verbatim,
   * so `AGENT_URL=http://127.0.0.1:2000` plus a request to
   * `/eve/v1/session` lands at `http://127.0.0.1:2000/eve/v1/session`.
   */
  agentUrl: string
  /**
   * Bearer token apps/api presents to Eve on every proxied request.
   * Eve validates it and treats the API gateway as a trusted caller.
   */
  internalToken: string
}

// Headers that belong to the wire-level transport between hops, not
// to the logical request. They MUST NOT be forwarded or the upstream
// fetch will hang waiting on headers it can't honor.
const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  // Browser cookies must not leak to the agent runtime.
  "cookie",
  // Content-Length is recomputed by fetch for the upstream request.
  "content-length",
])

export function makeAgentProxy(options: AgentProxyOptions): Hono {
  const { agentUrl, internalToken } = options
  // Untyped Hono — the proxy never reads `c.var.auth` or
  // `c.var.eventBus`, so it doesn't need the AppEnv variables.
  // Keeping the type generic narrower means `app.route("/eve", ...)`
  // (which mounts at root, not under `/api`) accepts it.
  const route = new Hono()

  // Eve exposes every method on `/eve/v1/session*` (POST to create,
  // GET to stream, etc.). The proxy is method-agnostic at this layer;
  // we forward verbatim and let Eve enforce.
  route.all("*", async (c) => {
    const upstreamUrl = new URL(c.req.path, agentUrl).toString()

    // Build the upstream header set: copy everything except hop-by-hop
    // headers, then inject our service-to-service auth.
    const headers = new Headers()
    for (const [key, value] of c.req.raw.headers) {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue
      headers.set(key, value)
    }
    headers.set("authorization", `Bearer ${internalToken}`)

    // Forward the body for non-GET/HEAD requests. `c.req.raw.body` is a
    // ReadableStream that fetch will consume lazily — no buffering
    // for large attachments.
    let body: BodyInit | undefined
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      body = c.req.raw.body ?? undefined
    }

    let upstream: Response
    try {
      upstream = await fetch(upstreamUrl, {
        method: c.req.method,
        headers,
        body,
      })
    } catch (err) {
      // Network-level failure (Eve down, DNS, etc.). Surface as 502
      // with a typed envelope so the browser can show something
      // meaningful instead of an unhandled promise rejection.
      logger.error(
        { path: c.req.path, err: err instanceof Error ? err.message : String(err) },
        "agent proxy upstream fetch failed",
      )
      return c.json(
        errorBody(
          "AGENT_UNREACHABLE",
          "Eve runtime is not reachable. Is apps/agent running?",
        ),
        asStatus(502),
      )
    }

    // Stream the response body back untouched. Eve's NDJSON over a
    // chunked response is preserved end-to-end.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
  })

  return route
}
