// Shared test setup for @workspace/auth.
//
// Loads env vars from `apps/api/.env` (the API runtime is the source
// of truth for `AUTH_SECRET` and friends). Sets safe defaults so tests
// don't require external configuration when that file is absent.
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
// packages/auth/tests/setup.ts → up 3 → repo root → apps/api
const repoRoot = resolve(__dirname, "..", "..", "..")
const apiEnvPath = resolve(repoRoot, "apps", "api", ".env")

function loadEnvFile() {
  if (!existsSync(apiEnvPath)) return
  const path = apiEnvPath
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

if (!process.env.AUTH_SECRET) {
  // Tests use a fixed dev secret. Never use this value in production.
  process.env.AUTH_SECRET = "testtesttesttesttesttesttesttest"
}
if (!process.env.AUTH_BASE_URL) {
  process.env.AUTH_BASE_URL = "http://localhost:4000"
}
