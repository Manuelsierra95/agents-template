import { describe, expect, it, beforeAll, afterAll } from "vitest"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { sql } from "drizzle-orm"

const TEST_URL = process.env.DATABASE_URL_TEST

const skipIfNoDb = TEST_URL ? describe : describe.skip

skipIfNoDb("database integration", () => {
  let client: ReturnType<typeof postgres>
  let db: ReturnType<typeof drizzle>

  beforeAll(() => {
    client = postgres(TEST_URL!, { max: 1, prepare: false })
    db = drizzle(client)
  })

  afterAll(async () => {
    await client.end({ timeout: 5 })
  })

  it("connects and runs select 1", async () => {
    const r = await db.execute<{ ok: number }>(sql`select 1 as ok`)
    expect(r[0]?.ok).toBe(1)
  })
})
