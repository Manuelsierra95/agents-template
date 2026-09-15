import { Hono } from "hono"
import { cors } from "hono/cors"
import { auth as defaultAuth, requireAuth, type AuthContext } from "@workspace/auth"
import { errorHandler, notFoundHandler } from "@/middleware/error"
import { requestLogger } from "@/middleware/logger"
import { loadEnv, type Env } from "@/config/env"
import { healthRoute } from "@/modules/health/health.route"
import { makeAuthRoute } from "@/modules/auth/auth.route"
import { meRoute } from "@/modules/me/me.route"
import { eventsRoute } from "@/modules/events/events.route"
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
  api.route("/events", events)

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
