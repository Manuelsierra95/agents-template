/**
 * Unit tests for the `requireInternalToken` middleware.
 *
 * These tests mount the middleware on a tiny inline Hono app and hit
 * it directly — no real `createApp`, no Postgres, no network. The
 * middleware's only responsibility is to compare the bearer token in
 * the `Authorization` header against the expected token and either
 * call `next()` or short-circuit with 401.
 */
import { describe, expect, it } from "vitest"
import { Hono } from "hono"

import { requireInternalToken } from "@/middleware/internal-token"

const EXPECTED_TOKEN = "test_internal_api_token_at_least_32_chars_long_xx"
const WRONG_TOKEN = "different_token_also_at_least_32_chars_long_xxxxxx"

function makeApp(): Hono {
  const app = new Hono()
  app.use("*", requireInternalToken({ expectedToken: EXPECTED_TOKEN }))
  app.get("/protected", (c) => c.json({ ok: true }))
  app.post("/protected", async (c) =>
    c.json({ ok: true, body: await c.req.json() }),
  )
  return app
}

describe("requireInternalToken", () => {
  it("accepts a request with the exact expected bearer token", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      headers: { authorization: `Bearer ${EXPECTED_TOKEN}` },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("accepts a POST request with the expected token and forwards the body", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "POST",
      headers: {
        authorization: `Bearer ${EXPECTED_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ hello: "world" }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, body: { hello: "world" } })
  })

  it("rejects a request with no Authorization header", async () => {
    const app = makeApp()
    const res = await app.request("/protected")
    expect(res.status).toBe(401)
    const body = (await res.json()) as {
      error: { code: string; message: string }
    }
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  it("rejects a request with a non-Bearer scheme", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      headers: { authorization: `Basic ${EXPECTED_TOKEN}` },
    })
    expect(res.status).toBe(401)
  })

  it("rejects a request with a wrong bearer token", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      headers: { authorization: `Bearer ${WRONG_TOKEN}` },
    })
    expect(res.status).toBe(401)
  })

  it("rejects a token that has a different length than the expected one", async () => {
    const app = makeApp()
    // Shorter token — even if the first N bytes happened to match,
    // the length difference must not leak via early-exit.
    const res = await app.request("/protected", {
      headers: { authorization: "Bearer short_token" },
    })
    expect(res.status).toBe(401)
  })

  it("treats an empty Bearer value as missing", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      headers: { authorization: "Bearer " },
    })
    expect(res.status).toBe(401)
  })

  it("treats an empty Authorization header as missing", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      headers: { authorization: "" },
    })
    expect(res.status).toBe(401)
  })
})
