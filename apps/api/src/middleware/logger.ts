import type { Context, Next } from "hono"
import { logger } from "@/lib/logger"

export async function requestLogger(c: Context, next: Next): Promise<void> {
  const start = Date.now()
  await next()
  const elapsed = Date.now() - start
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      elapsedMs: elapsed,
    },
    "request",
  )
}