import { describe, expect, it } from "vitest"
import { createApp } from "@/app"
import { loadEnv } from "@/config/env"

const app = createApp(
  loadEnv({
    API_PORT: "3000",
    API_HOST: "0.0.0.0",
    NODE_ENV: "test",
    CORS_ORIGINS: "*",
    LOG_LEVEL: "error",
    INTERNAL_API_TOKEN: "test_internal_api_token_at_least_32_chars_long_xx",
  }),
)

describe("GET /health", () => {
  it("returns 200 with an ok status payload", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.status).toBe("ok")
    expect(typeof body.uptimeSeconds).toBe("number")
    expect(typeof body.timestamp).toBe("string")
  })
})