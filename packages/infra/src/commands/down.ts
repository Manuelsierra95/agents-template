import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { checkDocker, formatDockerUnavailable, runCompose } from "../docker"
import { composeFilePath } from "../compose"

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

async function main(): Promise<void> {
  const docker = checkDocker()
  if (!docker.available) {
    console.error(formatDockerUnavailable())
    process.exit(1)
  }

  console.log(`[db:down] Stopping PostgreSQL (volume preserved)`)
  const r = await runCompose(["down"], composeFilePath, { stream: true })
  if (r.code !== 0) {
    console.error("[db:down] FATAL: docker compose down failed")
    process.exit(1)
  }
  console.log("[db:down] Done. To remove the volume: docker volume rm agents-template-postgres-data")
}

main().catch((err) => {
  console.error("[db:down] fatal:", err instanceof Error ? err.message : err)
  process.exit(1)
})
