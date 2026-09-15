import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import { loadDbConfig } from "./config"

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
    if (process.env[key] === undefined) process.env[key] = value
  }
}
loadEnvFile()

function redact(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//***@")
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[db:reset] FATAL: db:reset is dev-only and refuses to run when NODE_ENV=production.",
    )
    process.exit(1)
  }

  const cfg = loadDbConfig()
  const sql = postgres(cfg.DATABASE_URL, { max: 1, prepare: false })
  const db = drizzle(sql)

  console.log(`[db:reset] Dropping tables on ${redact(cfg.DATABASE_URL)}`)
  const tableRows = (await sql<
    { table_name: string }[]
  >`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)
  const tables = tableRows.map((r) => r.table_name)
  if (tables.length > 0) {
    const qualified = tables.map((t) => `"public"."${t}"`).join(", ")
    await sql.unsafe(`DROP TABLE ${qualified} CASCADE`)
  }
  await sql.unsafe(`DROP SCHEMA IF EXISTS drizzle CASCADE`)
  // Drop enums (they survive table drops).
  await sql.unsafe(
    `DO $$ DECLARE r record; BEGIN FOR r IN SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') LOOP EXECUTE format('DROP TYPE public.%I CASCADE', r.typname); END LOOP; END $$;`,
  )

  console.log("[db:reset] Re-applying migrations")
  await migrate(db, { migrationsFolder: "./drizzle/migrations" })

  // Seed by spawning `pnpm --filter @workspace/db db:seed` so the seed
  // runs in its own process and can load its own env.
  const { spawnSync } = await import("node:child_process")
  const r = spawnSync("pnpm", ["--filter", "@workspace/db", "db:seed"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  })
  if (r.status !== 0) {
    console.warn("[db:reset] seed exited non-zero, continuing")
  }

  console.log("[db:reset] Done")
  await sql.end({ timeout: 5 })
}

main().catch((err) => {
  console.error("[db:reset] fatal:", err instanceof Error ? err.message : err)
  process.exit(1)
})
