// Shared test setup for apps/api.
//
// Loads env vars from `apps/api/.env` if present. Sets safe defaults
// for tests so the suite does not require any external configuration
// beyond a reachable Postgres at DATABASE_URL.
//
// Why defaults matter: `@workspace/auth` calls `createAuth()` at module
// load time which requires DATABASE_URL to be valid, even when individual
// tests inject their own DbClient. We provide a test-DB default so the
// import chain doesn't fail before the per-suite setup runs.
import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
// apps/api/tests/setup.ts → up 1 → apps/api
const apiRoot = resolve(__dirname, "..")

function loadEnvFile() {
  const path = resolve(apiRoot, ".env")
  if (!existsSync(path)) return
  const text = readFileSync(path, "utf8")
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
loadEnvFile()

const FALLBACK_TEST_DB =
  "postgresql://agents:agents@127.0.0.1:5432/agents_test"

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ?? FALLBACK_TEST_DB
}
if (!process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL_TEST = FALLBACK_TEST_DB
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "testtesttesttesttesttesttesttest"
}
if (!process.env.AUTH_BASE_URL) {
  process.env.AUTH_BASE_URL = "http://localhost:4000"
}
if (!process.env.AUTH_TRUSTED_ORIGINS) {
  process.env.AUTH_TRUSTED_ORIGINS = "http://localhost:3000"
}
if (!process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS = "http://localhost:3000"
}
if (!process.env.INTERNAL_API_TOKEN) {
  process.env.INTERNAL_API_TOKEN =
    "test_internal_api_token_at_least_32_chars_long_xx"
}
if (!process.env.AGENT_URL) {
  process.env.AGENT_URL = "http://127.0.0.1:2000"
}
if (!process.env.PRIMARY_ORGANIZATION_ID) {
  process.env.PRIMARY_ORGANIZATION_ID =
    "00000000-0000-0000-0000-000000000001"
}
