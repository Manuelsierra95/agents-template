import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { checkDocker, formatDockerUnavailable, runCompose } from "../docker"
import { composeFilePath } from "../compose"
import { checkPostgresReady } from "../postgres"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..", "..", "..", "..")

function loadEnvFile() {
  if (process.env.DATABASE_URL) return
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

function redact(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//***@")
}

async function main(): Promise<void> {
  const docker = checkDocker()
  const url = process.env.DATABASE_URL

  console.log(`[db:status] Compose: ${composeFilePath}`)
  if (docker.available) {
    const ps = await runCompose(["ps"], composeFilePath)
    console.log(ps.stdout || "(no containers)")
  } else {
    console.log("[db:status] docker not available")
  }

  if (url) {
    const r = await checkPostgresReady(url, { timeoutMs: 2000 })
    if (r.ready) {
      console.log(`[db:status] reachable: yes (${redact(url)})`)
    } else {
      console.log(
        `[db:status] reachable: no — ${r.reason} (${redact(url)})`,
      )
    }
  } else {
    console.log("[db:status] DATABASE_URL not set; skipping reachability check")
  }
}

if (!process.env.DATABASE_URL) {
  console.log(
    "[db:status] Note: DATABASE_URL is unset. " +
      "Set it in .env (see repo root .env.example) for a connection check.",
  )
}

main().catch((err) => {
  console.error("[db:status] fatal:", err instanceof Error ? err.message : err)
  process.exit(1)
})
