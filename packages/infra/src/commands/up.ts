import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { checkPostgresReady } from "../postgres"
import { checkDocker, formatDockerUnavailable, runCompose } from "../docker"
import { composeFilePath } from "../compose"

const __dirname = dirname(fileURLToPath(import.meta.url))
// packages/infra/src/commands/up.ts → up 4 → repo root → apps/api
const repoRoot = resolve(__dirname, "..", "..", "..", "..")
const apiEnvPath = resolve(repoRoot, "apps", "api", ".env")

// Auto-load `apps/api/.env` if DATABASE_URL is not already set. This
// lets `pnpm db:up` work without prefixing `dotenv -e`.
function loadEnvFile() {
  if (process.env.DATABASE_URL) return
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

function parseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error(
      "[db:up] FATAL: DATABASE_URL is not set.\n" +
        "Set DATABASE_URL in apps/api/.env (see apps/api/.env.example)\n" +
        "or export it before running pnpm db:up.",
    )
    process.exit(1)
  }
  return url
}

async function pollUntilReady(
  url: string,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now()
  let lastReason = "unknown"
  while (Date.now() - start < timeoutMs) {
    const r = await checkPostgresReady(url, { timeoutMs: 2000 })
    if (r.ready) return true
    lastReason = r.reason
    await new Promise((res) => setTimeout(res, 1000))
  }
  console.error(
    `[db:up] FATAL: PostgreSQL did not become ready within ${timeoutMs}ms (last error: ${lastReason}).`,
  )
  return false
}

async function main(): Promise<void> {
  const docker = checkDocker()
  if (!docker.available) {
    console.error(formatDockerUnavailable())
    process.exit(1)
  }

  const url = parseUrl()

  const already = await checkPostgresReady(url, { timeoutMs: 2000 })
  if (already.ready) {
    console.log(`[db:up] PostgreSQL already running at ${redact(url)}`)
    return
  }

  console.log(`[db:up] Starting PostgreSQL via ${composeFilePath}`)
  const up = await runCompose(["up", "-d"], composeFilePath, { stream: true })
  if (up.code !== 0) {
    console.error("[db:up] FATAL: docker compose up failed")
    process.exit(1)
  }

  const ok = await pollUntilReady(url, 60_000)
  if (!ok) {
    const logs = await runCompose(["logs", "--tail=50"], composeFilePath)
    console.error("[db:up] Recent PostgreSQL logs:\n" + (logs.stdout || logs.stderr))
    process.exit(1)
  }

  console.log(`[db:up] PostgreSQL is ready at ${redact(url)}`)
}

function redact(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//***@")
}

main().catch((err) => {
  console.error("[db:up] fatal:", err instanceof Error ? err.message : err)
  process.exit(1)
})
