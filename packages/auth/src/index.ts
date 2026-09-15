export { auth, createAuth, type Auth } from "./auth"
export { loadAuthConfig, getAuthConfig, type AuthConfig } from "./config"
export { getMember, getDefaultOrganizationId } from "./membership"
export {
  createRequireAuth,
  requireAuth,
  type AuthVars,
} from "./middleware/require-auth"
export { requireRole } from "./middleware/require-role"
export { ROLE_HIERARCHY, hasRole, type Role } from "./permissions/roles"
export type {
  AuthContext,
  AuthUser,
  AuthSession,
  AuthMember,
} from "./context/types"
