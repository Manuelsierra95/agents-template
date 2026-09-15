import { Hono } from "hono"
import { streamSSE, type SSEStreamingApi } from "hono/streaming"
import { getOrCreateSseHub } from "@/lib/realtime/sse-hub"
import { logger } from "@/lib/logger"
import type { RealtimeEventBus } from "@/lib/realtime/event-bus"
import type { AppEnv } from "@/app"
import { requireAuthContext } from "@/lib/route-helpers"

const KEEPALIVE_INTERVAL_MS = 15_000

/**
 * `GET /api/events` — authenticated SSE endpoint.
 *
 * One long-lived `text/event-stream` per browser tab. The hub fans out
 * `RealtimeEvent`s to every connection whose `organizationId` matches
 * the publisher. A 15s keep-alive comment line is sent on every tick so
 * proxies (nginx, k8s ingress) don't kill the connection.
 *
 * Auth: requires a valid session + active organization. The middleware
 * `requireAuth` runs in the parent route group (see `app.ts`); the
 * `/api/events` mount point therefore inherits it.
 *
 * Wiring: the realtime bus is bound to the hub inside `createApp` (see
 * `app.ts`). This handler does not touch the bus directly — it only
 * registers the connection with the hub and waits for the client to
 * disconnect.
 */
export function eventsRoute(
  _eventBus?: RealtimeEventBus,
): Hono<{ Variables: AppEnv["Variables"] }> {
  const route = new Hono<{ Variables: AppEnv["Variables"] }>()

  route.get("/", (c) => {
    const auth = requireAuthContext(c)
    const hub = getOrCreateSseHub()

    return streamSSE(c, async (stream) => {
      const unregister = hub.addSubscriber(auth.organizationId, stream)
      const keepAlive = setInterval(() => {
        // SSE comment lines start with `:` and are ignored by the
        // browser's EventSource but they keep the TCP connection warm
        // across aggressive proxies.
        void stream.writeSSE({ event: "ping", data: "" }).catch((err) => {
          logger.debug({ err }, "sse keep-alive write failed")
        })
      }, KEEPALIVE_INTERVAL_MS)

      const cleanup = () => {
        clearInterval(keepAlive)
        unregister()
      }

      stream.onAbort(() => {
        cleanup()
        logger.debug(
          { organizationId: auth.organizationId, userId: auth.user.id },
          "sse client disconnected",
        )
      })

      logger.debug(
        {
          organizationId: auth.organizationId,
          userId: auth.user.id,
        },
        "sse client connected",
      )

      // Hold the connection open until the client aborts.
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve())
      })
    })
  })

  return route
}

// Re-export the streaming type so consumers of this module can declare
// the controller handle type without pulling from `hono/streaming`
// directly.
export type { SSEStreamingApi }
