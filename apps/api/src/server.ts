// MUST be the first import — bootstraps `process.env` from `.env` before
// the rest of the dependency graph boots (and `@workspace/auth`'s
// top-level `createAuth()` throws without `AUTH_SECRET`).
import "@/config/load-dotenv"

import { serve } from "@hono/node-server"
import { createApp } from "@/app"
import { loadEnv } from "@/config/env"
import { logger } from "@/lib/logger"
import { InMemoryEventBus } from "@/lib/realtime/in-memory-event-bus"
import { RedisRealtimeEventBus } from "@/lib/realtime/redis-event-bus"
import type { RealtimeEventBus } from "@/lib/realtime/event-bus"

const env = loadEnv()

// Pick the event bus: Redis when REDIS_URL is set, in-memory otherwise.
// In-memory stays in dev (no infra needed — except for fan-out across
// replicas) and in tests.
const eventBus: RealtimeEventBus | undefined = env.REDIS_URL
  ? new RedisRealtimeEventBus(env.REDIS_URL)
  : // In dev we want to keep the bus working even if Redis is down — we
    // always have an in-memory bus in the process so the local SSE
    // connections still receive events.
    env.NODE_ENV === "test"
    ? undefined
    : new InMemoryEventBus()

const app = createApp(env, { eventBus })

const server = serve(
  {
    fetch: app.fetch,
    port: env.API_PORT,
    hostname: env.API_HOST,
  },
  (info) => {
    logger.info(
      {
        port: info.port,
        host: info.address,
        env: env.NODE_ENV,
        bus: env.REDIS_URL ? "redis" : "in-memory",
      },
      "api listening",
    )
  },
)

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, "shutdown initiated")
  try {
    await eventBus?.close?.()
  } catch (err) {
    logger.error({ err }, "error closing event bus")
  }
  server.close(() => {
    logger.info({}, "server closed")
    process.exit(0)
  })
  // Hard-exit safety net in case the server.close callback stalls.
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))
