#!/usr/bin/env node
// One-shot helper: create the `agents_test` database inside the docker
// compose Postgres and apply the Drizzle migrations.
//
// Idempotent — safe to run multiple times. Exits non-zero on any
// failure so the caller (e.g. `pnpm db:test:setup`) sees a clear error.
//
// Usage: `pnpm db:test:setup`
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const POSTGRES_USER = process.env.POSTGRES_USER ?? "agents"
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? "agents"
const POSTGRES_DB = process.env.POSTGRES_DB ?? "agents"
const TEST_DB = process.env.TEST_DB ?? "agents_test"
const POSTGRES_HOST = process.env.POSTGRES_HOST ?? "127.0.0.1"
const POSTGRES_PORT = process.env.POSTGRES_PORT ?? "5432"
const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${TEST_DB}`

function step(label, fn) {
  process.stdout.write(`\u25CF ${label}\n`)
  const r = fn()
  if (r.status !== 0) {
    process.stderr.write(
      `\u2717 ${label} failed (exit ${r.status ?? "?"})\n`,
    )
    if (r.stderr) process.stderr.write(r.stderr.toString())
    process.exit(1)
  }
}

step("docker compose up -d postgres", () =>
  spawnSync(
    "docker",
    [
      "compose",
      "-f",
      "packages/infra/docker/compose.yml",
      "up",
      "-d",
      "postgres",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  ),
)

step("waiting for Postgres to accept connections", () => {
  for (let i = 0; i < 30; i++) {
    const r = spawnSync(
      "docker",
      [
        "exec",
        "agents-template-postgres",
        "pg_isready",
        "-U",
        POSTGRES_USER,
        "-d",
        POSTGRES_DB,
      ],
      { stdio: "pipe" },
    )
    if (r.status === 0) return r
    if (i === 29) return r
    spawnSync("sleep", ["1"])
  }
})

step(`create database ${TEST_DB} (if missing)`, () => {
  const r = spawnSync(
    "docker",
    [
      "exec",
      "agents-template-postgres",
      "psql",
      "-U",
      POSTGRES_USER,
      "-d",
      POSTGRES_DB,
      "-tc",
      `SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'`,
    ],
    { stdio: "pipe" },
  )
  if (r.status !== 0) return r
  if ((r.stdout?.toString() ?? "").trim() === "1") {
    process.stdout.write(`  (already exists, skipping)\n`)
    return { status: 0 }
  }
  return spawnSync(
    "docker",
    [
      "exec",
      "agents-template-postgres",
      "psql",
      "-U",
      POSTGRES_USER,
      "-d",
      POSTGRES_DB,
      "-c",
      `CREATE DATABASE ${TEST_DB}`,
    ],
    { stdio: "inherit" },
  )
})

step("apply Drizzle migrations to agents_test", () =>
  spawnSync(
    "pnpm",
    ["--filter", "@workspace/db", "db:migrate"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: TEST_URL,
      },
    },
  ),
)

process.stdout.write(`\n\u2705 Test database ready at ${TEST_URL}\n`)
process.stdout.write(`   Run \`pnpm test\` to execute the full test suite.\n`)
void existsSync
