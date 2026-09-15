import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { apiFetch } from "@/lib/api/client"
import { ApiError, isUnauthorized, isForbidden, isNotFound, isValidationError } from "@/lib/api/errors"

const originalApiUrl = process.env.API_URL
const originalPublicApiUrl = process.env.NEXT_PUBLIC_API_URL

beforeEach(() => {
  delete process.env.API_URL
  process.env.NEXT_PUBLIC_API_URL = "http://api.test"
})

afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.API_URL
  else process.env.API_URL = originalApiUrl
  if (originalPublicApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL
  else process.env.NEXT_PUBLIC_API_URL = originalPublicApiUrl
  vi.restoreAllMocks()
})

function mockFetchOnce(status: number, body: unknown, contentType = "application/json") {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": contentType },
    }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("apiFetch (server)", () => {
  it("prepends NEXT_PUBLIC_API_URL and uses credentials:include", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true })
    await apiFetch("/api/me")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://api.test/api/me")
    expect(init.credentials).toBe("include")
  })

  it("prefers API_URL over NEXT_PUBLIC_API_URL when both are set", async () => {
    process.env.API_URL = "http://api.internal"
    const fetchMock = mockFetchOnce(200, { ok: true })
    await apiFetch("/api/me")
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://api.internal/api/me")
  })

  it("returns the parsed JSON body on success", async () => {
    mockFetchOnce(200, { user: { id: "u" }, organizationId: "o", role: "owner" })
    const body = await apiFetch<{ user: { id: string }; organizationId: string; role: string }>(
      "/api/me",
    )
    expect(body.user.id).toBe("u")
  })

  it("serialises object bodies as JSON with Content-Type", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true })
    await apiFetch("/api/agents/main", {
      method: "PATCH",
      body: { enabled: false },
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false })
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    )
  })

  it("throws ApiError with code UNAUTHORIZED on 401", async () => {
    mockFetchOnce(401, { error: { code: "UNAUTHORIZED", message: "Unauthorized" } })
    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    })
    await apiFetch("/api/me").catch((e) => {
      expect(isUnauthorized(e)).toBe(true)
    })
  })

  it("throws ApiError with code FORBIDDEN on 403", async () => {
    mockFetchOnce(403, { error: { code: "FORBIDDEN", message: "Forbidden" } })
    await expect(apiFetch("/api/agents")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    })
  })

  it("throws ApiError with code RESOURCE_NOT_FOUND on 404", async () => {
    mockFetchOnce(404, { error: { code: "RESOURCE_NOT_FOUND", message: "Not found" } })
    await expect(apiFetch("/api/agents/missing")).rejects.toMatchObject({
      status: 404,
      code: "RESOURCE_NOT_FOUND",
    })
  })

  it("exposes details.issues on a validation error", async () => {
    mockFetchOnce(400, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: { issues: [{ code: "unrecognized_keys", keys: ["x"] }] },
      },
    })
    try {
      await apiFetch("/api/agents/main", {
        method: "PATCH",
        body: { x: 1 },
      })
      throw new Error("should have thrown")
    } catch (e) {
      const err = e as ApiError
      expect(isValidationError(err)).toBe(true)
      const details = err.details as { issues: { keys: string[] }[] }
      expect(details.issues[0]?.keys).toEqual(["x"])
    }
  })

  it("falls back to HTTP_<status> when the error body is missing", async () => {
    mockFetchOnce(500, {})
    try {
      await apiFetch("/api/agents")
      throw new Error("should have thrown")
    } catch (e) {
      const err = e as ApiError
      expect(err.code).toBe("HTTP_500")
      expect(err.status).toBe(500)
      expect(isForbidden(err)).toBe(false)
      expect(isUnauthorized(err)).toBe(false)
      expect(isNotFound(err)).toBe(false)
    }
  })

  it("throws when neither API_URL nor NEXT_PUBLIC_API_URL is set", async () => {
    delete process.env.API_URL
    delete process.env.NEXT_PUBLIC_API_URL
    await expect(apiFetch("/api/me")).rejects.toThrow(/API_URL/)
  })
})

describe("apiFetch (browser)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {} as Window)
  })

  it("uses a relative URL so the request stays same-origin", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true })
    await apiFetch("/api/conversations")
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/conversations")
    expect(init.credentials).toBe("include")
  })

  it("ignores API_URL and NEXT_PUBLIC_API_URL in the browser", async () => {
    process.env.API_URL = "http://api.internal"
    process.env.NEXT_PUBLIC_API_URL = "http://api.public"
    const fetchMock = mockFetchOnce(200, { ok: true })
    await apiFetch("/api/conversations")
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/conversations")
  })

  it("does not throw when env vars are missing in the browser", async () => {
    delete process.env.API_URL
    delete process.env.NEXT_PUBLIC_API_URL
    const fetchMock = mockFetchOnce(200, { ok: true })
    await expect(apiFetch("/api/conversations")).resolves.toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
