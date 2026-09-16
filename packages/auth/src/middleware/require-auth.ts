import type { MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import type { DbClient } from "@workspace/db"
import { db as defaultDb } from "@workspace/db"
import type { Auth } from "@workspace/auth/auth.ts"
import { getMember } from "@workspace/auth/membership.ts"
import type {
	AuthContext,
	AuthUser,
	AuthSession,
	AuthMember,
} from "@workspace/auth/context/types.ts"
import { auth as defaultAuth } from "@workspace/auth/auth.ts"

export type AuthVars = { readonly auth: AuthContext }

export type RequireAuthOptions = {
	/** Optional DbClient override. Used by tests to bind the membership lookup
	 * to the same DB instance that Better Auth writes to. */
	db?: DbClient
}

/**
 * `createRequireAuth<E>` keeps the caller's `Variables` shape intact while
 * widening it with `AuthVars`. The returned handler types as
 * `MiddlewareHandler<E>`, so callers can use it inside a `Hono<E>` without
 * losing their own typed variables.
 */
export function createRequireAuth<
	E extends { Variables: object } = { Variables: { readonly auth: AuthContext } },
>(
	targetAuth: Auth,
	options: RequireAuthOptions = {},
): MiddlewareHandler<E> {
	const client = options.db ?? defaultDb
	return async (c, next) => {
		const session = await targetAuth.api.getSession({
			headers: c.req.raw.headers,
		})

		if (!session?.user || !session.session) {
			throw new HTTPException(401, { message: "Unauthorized" })
		}

		if (!session.session.activeOrganizationId) {
			throw new HTTPException(403, { message: "Organization context not available" })
		}

		const member = await getMember(
			session.user.id,
			session.session.activeOrganizationId,
			{ client },
		)

		if (!member) {
			throw new HTTPException(403, { message: "Organization context not available" })
		}

		// Hono's `c.set("auth", …)` uses the merged `Variables` shape. We
		// cast here because the inferred `Variables` already has
		// `AuthVars` merged in at the call site.
		void (c as unknown as { set: (k: "auth", v: AuthContext) => void }).set(
			"auth",
			{
				user: session.user as AuthUser,
				session: session.session as AuthSession,
				organizationId: member.organizationId,
				member: member as AuthMember,
			},
		)

		await next()
	}
}

export const requireAuth = createRequireAuth(defaultAuth)
