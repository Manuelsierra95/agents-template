import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { checkDocker, formatDockerUnavailable, runCompose } from "../docker"
import { composeFilePath } from "../compose"

const __dirname = dirname(fileURLToPath(import.meta.url))
// packages/infra/src/commands/logs.ts → up 4 → repo root → apps/api
const repoRoot = resolve(__dirname, "..", "..", "..", "..")
const apiEnvPath = resolve(repoRoot, "apps", "api", ".env")

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

async function main(): Promise<void> {
  const docker = checkDocker()
  if (!docker.available) {
    console.error(formatDockerUnavailable())
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const tail = args.includes("--tail")
    ? args.slice(args.indexOf("--tail"))
    : ["--tail=200"]

  const r = await runCompose(["logs", ...tail, "-f", "postgres"], composeFilePath, {
    stream: true,
  })
  if (r.code !== 0) {
    console.error("[db:logs] FATAL: docker compose logs failed")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("[db:logs] fatal:", err instanceof Error ? err.message : err)
  process.exit(1)
})
