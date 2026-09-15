import { z } from "zod"

const DbEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
})

export type DbConfig = z.infer<typeof DbEnvSchema>

let cached: DbConfig | null = null

export function loadDbConfig(source: NodeJS.ProcessEnv = process.env): DbConfig {
  const parsed = DbEnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(`Invalid database environment variables:\n${issues}`)
  }
  return parsed.data
}

export function getDbConfig(): DbConfig {
  if (!cached) {
    cached = loadDbConfig()
  }
  return cached
}
