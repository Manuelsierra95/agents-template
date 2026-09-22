import { describe, expect, it } from "vitest"
import { loadEnv } from "@/config/env"

// Required secrets are passed explicitly; the suite tests env-shape
// behaviour, not the agent-runtime contract (covered by its own suite).
const REQUIRED_TEST_TOKEN =
  "test_internal_api_token_at_least_32_chars_long_xx"

describe("loadEnv", () => {
  it("applies defaults when values are absent", () => {
    const env = loadEnv({ INTERNAL_API_TOKEN: REQUIRED_TEST_TOKEN })
    expect(env.API_PORT).toBe(4000)
    expect(env.API_HOST).toBe("0.0.0.0")
    expect(env.NODE_ENV).toBe("development")
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000"])
    expect(env.LOG_LEVEL).toBe("info")
    expect(env.PRIMARY_ORGANIZATION_ID).toBe(
      "00000000-0000-0000-0000-000000000001",
    )
  })

  it("coerces numeric strings", () => {
    const env = loadEnv({
      API_PORT: "8080",
      INTERNAL_API_TOKEN: REQUIRED_TEST_TOKEN,
    })
    expect(env.API_PORT).toBe(8080)
  })

  it("splits comma-separated origins", () => {
    const env = loadEnv({
      CORS_ORIGINS: "http://a.test, http://b.test ",
      INTERNAL_API_TOKEN: REQUIRED_TEST_TOKEN,
    })
    expect(env.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"])
  })

  it("rejects unknown enum values", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "weird",
        INTERNAL_API_TOKEN: REQUIRED_TEST_TOKEN,
      }),
    ).toThrow(/Invalid environment/)
  })

  it("accepts CORS_ORIGINS=* wildcard", () => {
    const env = loadEnv({
      CORS_ORIGINS: "*",
      INTERNAL_API_TOKEN: REQUIRED_TEST_TOKEN,
    })
    expect(env.CORS_ORIGINS).toBe("*")
  })
})
