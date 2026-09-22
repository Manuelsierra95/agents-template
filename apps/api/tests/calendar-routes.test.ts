/**
 * Tests for the calendar + conversations routes introduced in
 * Phase 2D. Boots the full `createApp` and asserts validation paths
 * that don't require a DB round-trip. The query-side behaviour
 * (returning rows, FK scoping, error mapping) is covered by
 * `tests/db-queries.test.ts` against a real Postgres.
 */
import { describe, expect, it } from "vitest"

import { createApp } from "@/app"

const TOKEN = "test_internal_api_token_at_least_32_chars_long_xx"

function buildApp() {
  return createApp({
    AGENT_URL: "http://127.0.0.1:2000",
    INTERNAL_API_TOKEN: TOKEN,
    PRIMARY_ORGANIZATION_ID: "00000000-0000-0000-0000-000000000001",
    NODE_ENV: "test",
    API_PORT: 3000,
    API_HOST: "127.0.0.1",
    CORS_ORIGINS: ["http://localhost:3000"],
    LOG_LEVEL: "error",
  })
}

describe("Phase 2D — internal calendar route validation", () => {
  it("GET /api/internal/customers?phone=… rejects missing phone", async () => {
    const app = buildApp()
    const res = await app.request("/api/internal/customers", {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("INVALID_PHONE")
  })

  it("GET /api/internal/customers requires the internal token", async () => {
    const app = buildApp()
    const res = await app.request(
      "/api/internal/customers?phone=%2B34600000000",
    )
    expect(res.status).toBe(401)
  })

  it("GET /api/internal/availability?date=… rejects a missing date", async () => {
    const app = buildApp()
    const res = await app.request("/api/internal/availability", {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.status).toBe(400)
  })

  it("GET /api/internal/availability rejects a bad date format", async () => {
    const app = buildApp()
    const res = await app.request(
      "/api/internal/availability?date=not-a-date",
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(res.status).toBe(400)
  })

  it("POST /api/internal/bookings rejects malformed payloads", async () => {
    const app = buildApp()
    const res = await app.request("/api/internal/bookings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ date: "yesterday" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("INVALID_BOOKING")
  })

  it("PATCH /api/internal/bookings/:id/cancel rejects a non-UUID id", async () => {
    const app = buildApp()
    const res = await app.request("/api/internal/bookings/not-a-uuid/cancel", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it("PATCH /api/internal/bookings/:id/reschedule rejects a non-UUID id", async () => {
    const app = buildApp()
    const res = await app.request(
      "/api/internal/bookings/not-a-uuid/reschedule",
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ newDate: "2025-02-01", newTime: "11:00" }),
      },
    )
    expect(res.status).toBe(400)
  })

  it("PATCH /api/internal/bookings/:id/reschedule rejects a bad newDate", async () => {
    const app = buildApp()
    const res = await app.request(
      "/api/internal/bookings/00000000-0000-0000-0000-000000000099/reschedule",
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ newDate: "yesterday", newTime: "10:00" }),
      },
    )
    // 400 (bad input) before 404 (not found) — the route validates
    // the body before checking the booking exists.
    expect(res.status).toBe(400)
  })
})
