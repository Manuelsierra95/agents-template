import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

// Test the postgres readiness helper directly (no docker required).
import postgres from "postgres"

vi.mock("postgres", () => {
  return {
    default: vi.fn(),
  }
})

async function loadFresh() {
  vi.resetModules()
  const mod = await import("../src/postgres.js")
  return mod.checkPostgresReady
}

describe("checkPostgresReady", () => {
  const mockedFactory = postgres as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockedFactory.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns ready when select 1 succeeds", async () => {
    const endMock = vi.fn().mockResolvedValue(undefined)
    const tagFn: any = vi.fn(() => Promise.resolve([{ ok: 1 }]))
    tagFn.end = endMock
    mockedFactory.mockImplementation(() => tagFn)

    const check = await loadFresh()
    const r = await check("postgres://u:p@h:5432/d")
    expect(r).toEqual({ ready: true, url: "postgres://u:p@h:5432/d" })
    expect(endMock).toHaveBeenCalled()
  })

  it("returns not-ready when the connection throws", async () => {
    const tagFn: any = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")))
    tagFn.end = vi.fn().mockResolvedValue(undefined)
    mockedFactory.mockImplementation(() => tagFn)

    const check = await loadFresh()
    const r = await check("postgres://u:p@h:5432/d")
    expect(r.ready).toBe(false)
    if (!r.ready) {
      expect(r.reason).toBe("ECONNREFUSED")
    }
  })

  it("returns not-ready on timeout", async () => {
    vi.useFakeTimers()
    const tagFn: any = vi.fn(
      () => new Promise(() => undefined), // never resolves
    )
    tagFn.end = vi.fn().mockResolvedValue(undefined)
    mockedFactory.mockImplementation(() => tagFn)

    const check = await loadFresh()
    const promise = check("postgres://u:p@h:5432/d", { timeoutMs: 50 })
    await vi.advanceTimersByTimeAsync(60)
    const r = await promise
    expect(r.ready).toBe(false)
  })
})
