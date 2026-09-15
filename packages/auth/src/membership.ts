import { and, asc, desc, eq, isNotNull } from "drizzle-orm"
import { db as defaultDb, type DbClient } from "@workspace/db"
import { member, session, type Member } from "@workspace/db"

export async function getMember(
  userId: string,
  organizationId: string,
  options: { client?: DbClient } = {},
): Promise<Member | null> {
  const client = options.client ?? defaultDb
  const row = await client.query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
  })
  return row ?? null
}

/**
 * Resolve which organization should become `session.activeOrganizationId`
 * when a new session is created (e.g. on sign-in).
 *
 * Preference order:
 *   1. The most recently used active organization from another session,
 *      if the user is still a member of it.
 *   2. An `owner` membership (personal workspace), earliest first.
 *   3. Any other membership, earliest first.
 *   4. `null` when the user has no memberships yet (sign-up race —
 *      the org is provisioned in `user.create.after` and the session
 *      is patched there).
 */
export async function getDefaultOrganizationId(
  userId: string,
  options: { client?: DbClient } = {},
): Promise<string | null> {
  const client = options.client ?? defaultDb

  const [previous] = await client
    .select({ activeOrganizationId: session.activeOrganizationId })
    .from(session)
    .where(and(eq(session.userId, userId), isNotNull(session.activeOrganizationId)))
    .orderBy(desc(session.updatedAt))
    .limit(1)

  if (previous?.activeOrganizationId) {
    const stillMember = await getMember(userId, previous.activeOrganizationId, {
      client,
    })
    if (stillMember) return previous.activeOrganizationId
  }

  const memberships = await client
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))

  const owner = memberships.find((m) => m.role === "owner")
  return owner?.organizationId ?? memberships[0]?.organizationId ?? null
}
