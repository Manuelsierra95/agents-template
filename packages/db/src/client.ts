import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema/index"
import { loadDbConfig } from "./config"

export type DbClient = PostgresJsDatabase<typeof schema>
export type Sql = ReturnType<typeof postgres>

export type DbHandle = {
  db: DbClient
  sql: Sql
  close: () => Promise<void>
}

export function createDbHandle(connectionString: string): DbHandle {
  const sql = postgres(connectionString, { max: 10, prepare: false })
  const db = drizzle(sql, { schema, logger: false })
  return {
    db,
    sql,
    close: async () => {
      try {
        await sql.end({ timeout: 5 })
      } catch {
        // best-effort
      }
    },
  }
}

export function createDbClient(connectionString: string): DbClient {
  return createDbHandle(connectionString).db
}

let cachedDb: DbClient | null = null

export function getDb(): DbClient {
  const cfg = loadDbConfig()
  if (!cachedDb) {
    cachedDb = createDbClient(cfg.DATABASE_URL)
  }
  return cachedDb
}

/**
 * Test-only: clears the cached default DB so the next `getDb()` call
 * re-reads `DATABASE_URL` from `process.env`. Production code never
 * calls this; it exists so suites that swap `DATABASE_URL` mid-run
 * (e.g. `apps/api/tests/auth-battery.test.ts`) can rebind the proxy
 * the default Better Auth singleton still uses.
 */
export function resetDefaultDb(): void {
  cachedDb = null
}

export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})
