import { z } from "zod"

const AuthEnvSchema = z.object({
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_BASE_URL: z.string().url().default("http://localhost:4000"),
  AUTH_TRUSTED_ORIGINS: z.string().default(""),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
})

export type AuthConfig = z.infer<typeof AuthEnvSchema>

let cached: AuthConfig | null = null

export function loadAuthConfig(source: NodeJS.ProcessEnv = process.env): AuthConfig {
  const parsed = AuthEnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(`Invalid auth environment variables:\n${issues}`)
  }
  return parsed.data
}

export function getAuthConfig(): AuthConfig {
  if (!cached) {
    cached = loadAuthConfig()
  }
  return cached
}
