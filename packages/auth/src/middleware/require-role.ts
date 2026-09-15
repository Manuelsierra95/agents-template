import type { MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import type { AuthVars } from "./require-auth"
import { hasRole, type Role } from "../permissions/roles"

export function requireRole(
  required: Role | readonly Role[],
): MiddlewareHandler<{ Variables: AuthVars }> {
  return async (c, next) => {
    const auth = c.get("auth")
    if (!auth) {
      throw new HTTPException(401, { message: "Unauthorized" })
    }
    if (!hasRole(auth.member.role, required)) {
      throw new HTTPException(403, { message: "Insufficient role" })
    }
    await next()
  }
}
