// Shared test setup for @workspace/db.
//
// Loads env vars from `apps/api/.env` (the API runtime is the source
// of truth for `DATABASE_URL` and `DATABASE_URL_TEST`). If the file is
// absent the suite falls back to safe defaults so it can still be
// skipped cleanly via `if (!TEST_URL) describe.skip`.
import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
// packages/db/tests/setup.ts → up 3 → repo root → apps/api
const repoRoot = resolve(__dirname, "..", "..", "..")
const apiEnvPath = resolve(repoRoot, "apps", "api", ".env")

function loadEnvFile() {
  if (!existsSync(apiEnvPath)) return
  const text = readFileSync(apiEnvPath, "utf8")
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
