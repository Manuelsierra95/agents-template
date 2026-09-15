import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { AppError, isAppError } from "@/lib/errors"
import { asStatus, errorBody } from "@/lib/responses"
import { logger } from "@/lib/logger"

function codeForStatus(status: number): string {
  if (status === 401) return "UNAUTHORIZED"
  if (status === 403) return "FORBIDDEN"
  if (status === 400) return "VALIDATION_ERROR"
  if (status === 404) return "RESOURCE_NOT_FOUND"
  if (status === 409) return "CONFLICT"
  if (status >= 500) return "INTERNAL_ERROR"
  return "HTTP_ERROR"
}

// TODO(fase 2): reintroducir isEveError + statusFromEve cuando se añada
// apps/agent (Eve runtime). Eliminado en la migración inicial — no hay
// cliente Eve en este repo todavía.
export function errorHandler(err: Error, c: Context): Response {
  if (isAppError(err)) {
    return c.json(errorBody(err.code, err.message, err.details), asStatus(err.status))
  }
  if (err instanceof HTTPException) {
    return c.json(
      errorBody(codeForStatus(err.status), err.message),
      asStatus(err.status),
    )
  }
  logger.error({ err: err.message, stack: err.stack }, "unhandled error")
  const fallback = new AppError("INTERNAL_ERROR", 500, "Internal server error")
  return c.json(errorBody(fallback.code, fallback.message), asStatus(fallback.status))
}

export function notFoundHandler(c: Context): Response {
  return c.json(
    errorBody("RESOURCE_NOT_FOUND", `Route ${c.req.method} ${c.req.path} not found`),
    404,
  )
}
