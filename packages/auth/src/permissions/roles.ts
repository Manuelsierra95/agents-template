export const ROLE_HIERARCHY = {
  owner: 100,
  admin: 50,
  member: 10,
} as const

export type Role = keyof typeof ROLE_HIERARCHY

const ROLE_RANKS: Record<string, number> = {
  owner: ROLE_HIERARCHY.owner,
  admin: ROLE_HIERARCHY.admin,
  member: ROLE_HIERARCHY.member,
}

export function hasRole(
  memberRole: string,
  required: Role | readonly Role[],
): boolean {
  const requiredRoles: readonly Role[] = Array.isArray(required)
    ? required
    : [required]
  const memberRank = ROLE_RANKS[memberRole] ?? 0
  const requiredRank = Math.min(...requiredRoles.map((r) => ROLE_RANKS[r] ?? 0))
  return memberRank >= requiredRank
}
