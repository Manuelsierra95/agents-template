/**
 * Side-effect-only .env loader. Import this as the very first line of
 * any entry script that needs `DATABASE_URL`, `AUTH_SECRET`, etc.
 * before the rest of the dependency graph boots.
 *
 * Loads `apps/api/.env` — the API runtime owns its own env file. There
 * is no longer a repo-root `.env` to fall back to.
 *
 * Why a separate file: ES modules hoist all imports above any top-level
 * code, so an inline `loadEnvFile()` call in `server.ts` would still
 * run *after* `import { createApp } from "@/app"` — which in turn
 * boots `@workspace/auth` at module init and throws on the missing
 * secret. Importing this file as `import "@/config/load-dotenv"` is
 * the trigger that runs the loader before the rest of the graph is
 * evaluated.
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
// apps/api/src/config/load-dotenv.ts → up 2 → apps/api
const apiRoot = resolve(__dirname, "..", "..")
const envPath = resolve(apiRoot, ".env")

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) return null
  const eq = trimmed.indexOf("=")
  if (eq <= 0) return null
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return [key, value]
}

// Skip if the critical vars are already in the environment — same
// convention as `packages/db/src/migrate.ts` and
// `packages/infra/src/commands/up.ts`.
if (!process.env.AUTH_SECRET && existsSync(envPath)) {
  const text = readFileSync(envPath, "utf8")
  for (const line of text.split("\n")) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue
    const [key, value] = parsed
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
