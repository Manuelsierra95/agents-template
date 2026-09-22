import { describe, expect, it } from "vitest"
import { createApp } from "@/app"
import { loadEnv } from "@/config/env"

const app = createApp(
  loadEnv({
    API_PORT: "4000",
    API_HOST: "127.0.0.1",
    NODE_ENV: "test",
    CORS_ORIGINS: "http://localhost:3000,http://localhost:3001",
    LOG_LEVEL: "error",
    INTERNAL_API_TOKEN: "test_internal_api_token_at_least_32_chars_long_xx",
  }),
)

describe("CORS preflight", () => {
  it("echoes an allowed origin and sets credentials:true on preflight", async () => {
    const res = await app.request("/api/me", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    )
    expect(res.headers.get("access-control-allow-credentials")).toBe("true")
  })

  it("echoes a second allowed origin", async () => {
    const res = await app.request("/api/me", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3001",
        "Access-Control-Request-Method": "GET",
      },
    })
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3001",
    )
    expect(res.headers.get("access-control-allow-credentials")).toBe("true")
  })

  it("does not echo a disallowed origin", async () => {
    const res = await app.request("/api/me", {
      method: "OPTIONS",
      headers: {
        Origin: "http://evil.example",
        "Access-Control-Request-Method": "GET",
      },
    })
    expect(res.headers.get("access-control-allow-origin")).not.toBe(
      "http://evil.example",
    )
  })
})

describe("CORS simple request", () => {
  it("includes the allow-origin + credentials headers on a simple GET", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "http://localhost:3000" },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    )
    expect(res.headers.get("access-control-allow-credentials")).toBe("true")
  })
})