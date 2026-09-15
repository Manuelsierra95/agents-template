import { describe, expect, it } from "vitest"
import { loadAuthConfig } from "../src/config"

describe("loadAuthConfig", () => {
  it("requires AUTH_SECRET with at least 32 characters", () => {
    expect(() => loadAuthConfig({})).toThrow(/AUTH_SECRET/)
    expect(() => loadAuthConfig({ AUTH_SECRET: "short" })).toThrow(/at least 32/)
  })

  it("parses valid config", () => {
    const cfg = loadAuthConfig({
      AUTH_SECRET: "x".repeat(32),
      AUTH_BASE_URL: "http://localhost:4000",
      AUTH_TRUSTED_ORIGINS: "http://a.test, http://b.test",
      NODE_ENV: "development",
    })
    expect(cfg.AUTH_SECRET).toBe("x".repeat(32))
    expect(cfg.AUTH_BASE_URL).toBe("http://localhost:4000")
    expect(cfg.AUTH_TRUSTED_ORIGINS).toBe("http://a.test, http://b.test")
    expect(cfg.NODE_ENV).toBe("development")
  })

  it("defaults AUTH_BASE_URL when missing", () => {
    const cfg = loadAuthConfig({ AUTH_SECRET: "x".repeat(32) })
    expect(cfg.AUTH_BASE_URL).toBe("http://localhost:4000")
  })

  it("rejects malformed AUTH_BASE_URL", () => {
    expect(() =>
      loadAuthConfig({ AUTH_SECRET: "x".repeat(32), AUTH_BASE_URL: "not-a-url" }),
    ).toThrow(/AUTH_BASE_URL/)
  })
})
