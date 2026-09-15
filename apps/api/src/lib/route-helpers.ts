import type { Context } from "hono"
import type { AppEnv } from "@/app"
import { ZodError } from "zod"

type AuthContext = NonNullable<AppEnv["Variables"]["auth"]>

export function requireAuthContext(
  c: { get: (k: "auth") => AuthContext | undefined },
): AuthContext {
  const auth = c.get("auth")
  if (!auth) throw new Error("requireAuthContext called without auth context")
  return auth
}

export function jsonError(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(
    {
      error: details
        ? { code, message, details: { issues: details } }
        : { code, message },
    },
    status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 504,
  )
}

export function zodErrorResponse(c: Context, err: ZodError) {
  return jsonError(c, 400, "VALIDATION_ERROR", "Invalid request", err.issues)
}
