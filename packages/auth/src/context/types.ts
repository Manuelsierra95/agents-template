import type { User, Session, Member } from "@workspace/db"

export type AuthUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
}

export type AuthSession = {
  id: string
  expiresAt: Date
  token: string
  createdAt: Date
  updatedAt: Date
  ipAddress: string | null
  userAgent: string | null
  userId: string
  activeOrganizationId: string | null
}

export type AuthMember = {
  id: string
  organizationId: string
  userId: string
  role: string
  createdAt: Date
}

export type AuthContext = {
  user: AuthUser
  session: AuthSession
  organizationId: string
  member: AuthMember
}

// Internal alias to keep the relationship between Drizzle row types and
// our public Auth types explicit. Both shapes are structurally compatible
// (Drizzle's `string | null` is assignable to `string | null`).
export type _DbUser = User
export type _DbSession = Session
export type _DbMember = Member
