/**
 * DB lifecycle helpers for the integration tests in this workspace.
 *
 * Connects to `DATABASE_URL_TEST` (docker-compose dev DB) and exposes
 * `resetDb(handle)` for suites that need a clean slate, plus
 * `seedOrg(handle, id)` so every suite has a valid `organization`
 * row for the FK on `customer` / `booking` / `customer_conversation`.
 */
import { createDbHandle, type DbHandle, organization } from "@workspace/db"

if (!process.env.DATABASE_URL_TEST) {
  // Skip silently — individual tests check `if (!handle) return` so
  // the CI runs without a test DB still pass.
}

/** Canonical test organization id — matches the placeholder apps/api
 * uses for `PRIMARY_ORGANIZATION_ID` in dev / test environments. */
export const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001"

/**
 * Insert the test organization so FK constraints on
 * `customer.organization_id` / `booking.organization_id` /
 * `customer_conversation.organization_id` are satisfied. Safe to call
 * on an already-seeded row (uses `on conflict do nothing`).
 */
export async function seedOrg(handle: DbHandle, id: string = TEST_ORG_ID): Promise<void> {
  await handle.db
    .insert(organization)
    .values({ id, name: `Test Org ${id}` })
    .onConflictDoNothing()
}

/**
 * Truncate every table and re-seed the test organization. The
 * `onConflictDoNothing` on the seed is defensive — the truncation
 * removes the row first, so the seed always wins.
 */
export async function resetDb(handle: DbHandle): Promise<void> {
  await handle.sql.unsafe(
    `TRUNCATE TABLE
       calendar_event,
       conversation_message,
       customer_conversation,
       booking,
       customer,
       invitation,
       member,
       organization,
       session,
       account,
       verification,
       jwks,
       "user"
     RESTART IDENTITY CASCADE`,
  )
  await seedOrg(handle)
}

export async function createTestDbHandle(): Promise<DbHandle> {
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error("DATABASE_URL_TEST is required for DB-touching tests.")
  }
  return createDbHandle(process.env.DATABASE_URL_TEST)
}
