// Shared test setup for @workspace/auth.
//
// Loads env vars from .env if present (test runs may not have them
// inherited from dotenv-cli). Also sets safe defaults so tests don't
// require external configuration.
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..", "..", "..")

function loadEnvFile() {
  const path = resolve(repoRoot, ".env")
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

if (!process.env.AUTH_SECRET) {
  // Tests use a fixed dev secret. Never use this value in production.
  process.env.AUTH_SECRET = "testtesttesttesttesttesttesttest"
}
if (!process.env.AUTH_BASE_URL) {
  process.env.AUTH_BASE_URL = "http://localhost:4000"
}
