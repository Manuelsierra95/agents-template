import { z } from "zod"

const EnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value === "*"
        ? "*"
        : value
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean)
    ),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // apps/agent — Eve runtime. URL is where apps/api proxies `/eve/*`
  // requests to. Default matches Eve's documented local port (5000).
  AGENT_URL: z.string().url().default("http://127.0.0.1:5000"),
  // Shared secret between apps/api and apps/agent. Used in two ways:
  //   - apps/api injects it as `Authorization: Bearer ${INTERNAL_API_TOKEN}`
  //     when proxying `/eve/*` requests to apps/agent.
  //   - apps/agent sends it on every tool call that hits
  //     `/api/internal/*` so apps/api can validate the request comes
  //     from the trusted agent runtime and not a public client.
  // Minimum length keeps misconfigurations (empty / short tokens) loud.
  INTERNAL_API_TOKEN: z.string().min(32),
  // Single tenant scope for the agent-facing internal API. The agent
  // itself is single-tenant (one tenant per `apps/agent` instance);
  // apps/api injects this on every `/api/internal/*` request so the
  // agent doesn't have to know which tenant it's serving.
  PRIMARY_ORGANIZATION_ID: z
    .string()
    .min(1)
    .default("00000000-0000-0000-0000-000000000001"),
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
