import { describe, expect, it } from "vitest"
import { loadEnv } from "@/config/env"

describe("loadEnv", () => {
  it("applies defaults when values are absent", () => {
    const env = loadEnv({})
    expect(env.API_PORT).toBe(3000)
    expect(env.API_HOST).toBe("0.0.0.0")
    expect(env.NODE_ENV).toBe("development")
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000"])
    expect(env.LOG_LEVEL).toBe("info")
  })

  it("coerces numeric strings", () => {
    const env = loadEnv({ API_PORT: "8080" })
    expect(env.API_PORT).toBe(8080)
  })

  it("splits comma-separated origins", () => {
    const env = loadEnv({ CORS_ORIGINS: "http://a.test, http://b.test " })
    expect(env.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"])
  })

  it("rejects unknown enum values", () => {
    expect(() => loadEnv({ NODE_ENV: "weird" })).toThrow(/Invalid environment/)
  })

  it("accepts CORS_ORIGINS=* wildcard", () => {
    const env = loadEnv({ CORS_ORIGINS: "*" })
    expect(env.CORS_ORIGINS).toBe("*")
  })
})
