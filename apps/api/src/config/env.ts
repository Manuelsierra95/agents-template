import { z } from "zod"

const EnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value === "*"
        ? "*"
        : value.split(",").map((origin) => origin.trim()).filter(Boolean),
    ),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // TODO(fase 2): reintroducir AGENT_URL + INTERNAL_API_TOKEN cuando se
  // añada apps/agent (Eve runtime). Eliminados en la migración inicial.
  // Optional Redis URL for cross-pod realtime fan-out. When unset, the
  // API uses an in-process event bus — fine for single-replica and dev.
  REDIS_URL: z.string().url().optional(),
  // Better Auth / DB — passed through to @workspace/auth via process.env.
  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_BASE_URL: z.string().url().optional(),
  AUTH_TRUSTED_ORIGINS: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  return parsed.data
}
