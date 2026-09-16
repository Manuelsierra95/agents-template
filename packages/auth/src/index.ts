export { auth, createAuth, type Auth } from "@workspace/auth/auth.ts"
export { loadAuthConfig, getAuthConfig, type AuthConfig } from "@workspace/auth/config.ts"
export { getMember, getDefaultOrganizationId } from "@workspace/auth/membership.ts"
export {
  createRequireAuth,
  requireAuth,
  type AuthVars,
} from "@workspace/auth/middleware/require-auth.ts"
export { requireRole } from "@workspace/auth/middleware/require-role.ts"
export { ROLE_HIERARCHY, hasRole, type Role } from "@workspace/auth/permissions/roles.ts"
export type {
  AuthContext,
  AuthUser,
  AuthSession,
  AuthMember,
} from "@workspace/auth/context/types.ts"
