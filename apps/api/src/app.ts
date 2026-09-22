import { Hono } from "hono"
import { cors } from "hono/cors"
import { auth as defaultAuth, requireAuth, type AuthContext } from "@workspace/auth"
import { errorHandler, notFoundHandler } from "@/middleware/error"
import { requestLogger } from "@/middleware/logger"
import { requireInternalToken } from "@/middleware/internal-token"
import { loadEnv, type Env } from "@/config/env"
import { healthRoute } from "@/modules/health/health.route"
import { makeAuthRoute } from "@/modules/auth/auth.route"
import { meRoute } from "@/modules/me/me.route"
import { eventsRoute } from "@/modules/events/events.route"
import { makeAgentProxy } from "@/modules/agent/agent.proxy"
import { makeCustomerRoute } from "@/modules/internal/customers.route"
import { makeAvailabilityRoute } from "@/modules/internal/availability.route"
import { makeBookingRoute } from "@/modules/internal/bookings.route"
import { makeConversationRoute } from "@/modules/conversations/conversations.route"
import { makeChatRoute } from "@/modules/chat/chat.route"
import { makeCalendarEventsRoute } from "@/modules/calendar/events.route"
import { getOrCreateSseHub, resetSseHubForTests } from "@/lib/realtime/sse-hub"
import type { RealtimeEventBus } from "@/lib/realtime/event-bus"
import { logger } from "@/lib/logger"

export type AppEnv = {
  Variables: {
    /** Set by `requireAuth` middleware on every authenticated route. */
    readonly auth: AuthContext
    /** Bound at construction time so route handlers can `publishRealtime`. */
    readonly eventBus: RealtimeEventBus | undefined
  }
}

export type CreateAppOptions = {
  /** Optional auth instance override. Tests inject a fake to bypass
   * Better Auth lookups. */
  auth?: typeof defaultAuth
  /** Optional realtime bus. When provided, the SSE hub is bound to it so
   * publishers on the bus auto-fan-out to subscribed SSE clients.
   * Tests omit it to keep the hub idle. */
  eventBus?: RealtimeEventBus
}

export function createApp(
  env: Env = loadEnv(),
  options: CreateAppOptions = {}
): Hono<AppEnv> {
  const authInstance = options.auth ?? defaultAuth
  const eventBus: RealtimeEventBus | undefined = options.eventBus

  const app = new Hono<AppEnv>()

  app.use("*", requestLogger)

  app.use(
    "*",
    cors({
      origin: env.CORS_ORIGINS,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
    })
  )

  // Public routes (no /api prefix).
  app.route("/", healthRoute)

  // apps/agent (Eve runtime) — pass-through at the root, NOT under
  // `/api`. The browser hits `/eve/*`; the Next.js rewrite forwards
  // it to apps/api at the same path (no `/api/` prefix), so the proxy
  // is mounted here at root. Eve handles its own auth based on the
  // bearer token we inject on every upstream request.
  app.route(
    "/eve",
    makeAgentProxy({
      agentUrl: env.AGENT_URL,
      internalToken: env.INTERNAL_API_TOKEN,
    }),
  )

  // Everything else lives under /api.
  const api = new Hono<AppEnv>()
  api.use("*", async (c, next) => {
    c.set("eventBus", eventBus)
    await next()
  })

  // Better Auth's HTTP handler — must run unauthenticated.
  api.route("/auth", makeAuthRoute(authInstance))

  // Authenticated namespace. Every route below requires a valid session
  // with a member of the active organization.
  const me = new Hono<AppEnv>()
  me.use("*", requireAuth)
  me.route("/", meRoute)
  api.route("/me", me)

  // SSE endpoint — same auth gate as `/me`, dedicated route so the
  // `streamSSE` response shape isn't disturbed by the CORS middleware
  // (Hono's CORS handles preflight only; SSE responses don't need to
  // set ACAO headers because they have no body for cross-origin to
  // read).
  const events = new Hono<AppEnv>()
  events.use("*", requireAuth)
  events.route("/", eventsRoute(eventBus))
  api.route("/realtime", events)

  // Internal-service namespace. Every route here is gated by
  // `requireInternalToken` — only `apps/agent` (and any other server-
  // to-server caller we add later) can reach them. Browser clients
  // cannot: there's no session cookie path, only the bearer token.
  //
  // The middleware order matters: `requireInternalToken` runs BEFORE
  // any handler, so a missing/bad token short-circuits with 401 and
  // the handler never sees the request.
  const internal = new Hono<AppEnv>()
  internal.use(
    "*",
    requireInternalToken({ expectedToken: env.INTERNAL_API_TOKEN }),
  )
  // Phase 2D — agent's calendar tool backends. Single-tenant for now:
  // each route receives `env.PRIMARY_ORGANIZATION_ID` as the org scope.
  internal.route(
    "/customers",
    makeCustomerRoute({ organizationId: env.PRIMARY_ORGANIZATION_ID }),
  )
  internal.route(
    "/availability",
    makeAvailabilityRoute({ organizationId: env.PRIMARY_ORGANIZATION_ID }),
  )
  internal.route(
    "/bookings",
    makeBookingRoute({ organizationId: env.PRIMARY_ORGANIZATION_ID }),
  )
  api.route("/internal", internal)

  // Operator-facing conversations — session-authenticated (parallel
  // to `/api/me`) because the UI is multi-tenant and threads are
  // scoped to the caller's org via `ctx.var.auth.organizationId`.
  const conversations = new Hono<AppEnv>()
  conversations.use("*", requireAuth)
  conversations.route("/", makeConversationRoute())
  // Phase 2E — the chat entry-point used by `apps/web`'s `use-chat-stream`
  // hook. Sits in the same session-auth namespace as `/api/me` and
  // `/api/conversations` because the browser posts with the user's
  // session cookie.
  conversations.route("/messages", makeChatRoute())
  api.route("/chat", conversations)

  // Phase 2F — operator-facing calendar events CRUD. Session-authenticated
  // for the same reason as `/api/chat` and `/api/conversations`:
  // the dashboard is multi-tenant and the row scope flows from
  // `ctx.var.auth.organizationId`. Realtime updates are published via
  // `c.var.eventBus`; consumers (`apps/web`) listen on `/api/realtime`.
  const calendar = new Hono<AppEnv>()
  calendar.use("*", requireAuth)
  calendar.route("/events", makeCalendarEventsRoute())
  api.route("/calendar", calendar)

  app.route("/api", api)

  app.notFound(notFoundHandler)
  app.onError(errorHandler)

  // Bind the realtime bus to the SSE hub inside `createApp` so it works
  // identically in production (`server.ts`) and in tests. Failures are
  // logged but don't block app construction — the hub is idempotent and
  // will retry on the next bind.
  if (eventBus) {
    getOrCreateSseHub()
      .bindTo(eventBus)
      .then(() =>
        logger.info({}, "realtime bus bound to sse hub"),
      )
      .catch((err) =>
        logger.error({ err }, "failed to bind realtime bus to sse hub"),
      )
  }

  return app
}

/** Test-only reset: allows tests to swap the global hub between suites. */
export { resetSseHubForTests }
