import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import { loadDbConfig } from "@workspace/db/config.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..", "..", "..")

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
  const cfg = loadDbConfig()
  const sql = postgres(cfg.DATABASE_URL, { max: 1, prepare: false })
  const db = drizzle(sql)
  console.log(`[db:migrate] Applying migrations to ${redact(cfg.DATABASE_URL)}`)
  // Ensure the connecting user owns the public schema so newly created
  // tables are reachable. This is a no-op when the connecting user is
  // already the schema owner.
  await grantPublic(sql)
  await migrate(db, { migrationsFolder: "./drizzle/migrations" })
  console.log("[db:migrate] Done")
  await sql.end({ timeout: 5 })
}

async function grantPublic(sql: ReturnType<typeof postgres>): Promise<void> {
  const rows = (await sql`select current_user as user`) as Array<{ user: string }>
  const user = rows[0]?.user
  if (!user) return
  await sql.unsafe(`GRANT ALL ON SCHEMA public TO "${user.replace(/"/g, '""')}"`)
  await sql.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${user.replace(/"/g, '""')}"`,
  )
  await sql.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${user.replace(/"/g, '""')}"`,
  )
}

function redact(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//***@")
}

main().catch((err) => {
  console.error("[db:migrate] fatal:", err instanceof Error ? err.message : err)
  process.exit(1)
})
