export {
  db,
  getDb,
  resetDefaultDb,
  createDbClient,
  createDbHandle,
  type DbClient,
  type DbHandle,
  type Sql,
} from "@workspace/db/client.ts"
export { loadDbConfig, getDbConfig, type DbConfig } from "@workspace/db/config.ts"
export {
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
  jwks,
  type User,
  type Session,
  type Account,
  type Verification,
  type Organization,
  type Member,
  type Invitation,
} from "@workspace/db/schema/index.ts"
export * as schema from "@workspace/db/schema/index.ts"
export {
  and,
  eq,
  ne,
  or,
  sql,
  gt,
  gte,
  lt,
  lte,
  desc,
  asc,
  inArray,
  ilike,
  isNull,
} from "drizzle-orm"

// Re-export the queries at the package root so callers don't need
// to know which file each query lives in.
export * from "@workspace/db/queries/index.ts"
