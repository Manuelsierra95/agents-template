import { describe, expect, it } from "vitest"
import { loadDbConfig } from "@workspace/db/config.ts"

describe("loadDbConfig", () => {
  it("requires DATABASE_URL", () => {
    expect(() => loadDbConfig({})).toThrow(/Invalid database environment/)
  })

  it("returns parsed config with DATABASE_URL set", () => {
    const cfg = loadDbConfig({
      DATABASE_URL: "postgresql://u:p@h:5432/d",
      NODE_ENV: "development",
    })
    expect(cfg.DATABASE_URL).toBe("postgresql://u:p@h:5432/d")
    expect(cfg.NODE_ENV).toBe("development")
  })

  it("defaults NODE_ENV to development", () => {
    const cfg = loadDbConfig({ DATABASE_URL: "postgresql://u@h/d" })
    expect(cfg.NODE_ENV).toBe("development")
  })

  it("accepts DATABASE_URL_TEST", () => {
    const cfg = loadDbConfig({
      DATABASE_URL: "postgresql://u@h/d",
      DATABASE_URL_TEST: "postgresql://u@h/d_test",
    })
    expect(cfg.DATABASE_URL_TEST).toBe("postgresql://u@h/d_test")
  })

  it("rejects unknown NODE_ENV values", () => {
    expect(() =>
      loadDbConfig({ DATABASE_URL: "postgresql://u@h/d", NODE_ENV: "weird" }),
    ).toThrow(/Invalid database environment/)
  })
})
