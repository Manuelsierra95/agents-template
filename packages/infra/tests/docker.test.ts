import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("node:child_process", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("node:child_process")
  return {
    ...actual,
    spawnSync: vi.fn(),
  }
})

async function loadFresh() {
  vi.resetModules()
  return import("../src/docker.js")
}

describe("checkDocker", () => {
  let mocked: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { spawnSync } = await import("node:child_process")
    mocked = spawnSync as unknown as ReturnType<typeof vi.fn>
    mocked.mockReset()
  })

  it("returns unavailable when docker --version exits non-zero", async () => {
    mocked.mockReturnValueOnce({ status: 1, stdout: "", stderr: "" } as any)
    const { checkDocker } = await loadFresh()
    const r = checkDocker()
    expect(r.available).toBe(false)
  })

  it("returns available with compose version on success", async () => {
    mocked
      .mockReturnValueOnce({
        status: 0,
        stdout: "Docker version 28.0.1",
        stderr: "",
      } as any)
      .mockReturnValueOnce({
        status: 0,
        stdout: "Docker Compose version v2.33.1",
        stderr: "",
      } as any)
    const { checkDocker } = await loadFresh()
    const r = checkDocker()
    expect(r.available).toBe(true)
    expect(r.version).toContain("28.0.1")
    expect(r.composeVersion).toContain("v2.33.1")
  })
})
