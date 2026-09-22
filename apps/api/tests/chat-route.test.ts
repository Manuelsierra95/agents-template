/**
 * Tests for `apps/api`'s `POST /api/chat/messages` route.
 *
 * Boots the full `createApp`. The unauthenticated paths (the auth
 * gate is `requireAuth` on the parent namespace) are the most
 * security-sensitive branches and the easiest to test without
 * standing up a full Better Auth session fixture.
 *
 * The DB-touching and streaming paths are covered end-to-end by:
 *  - `tests/db-queries.test.ts` (the queries used inside the route)
 *  - `apps/web/tests/features/use-chat-stream.test.ts` (the NDJSON
 *    parsing semantics the route relies on)
 *
 * Together those are sufficient — the route itself is a thin
 * pass-through plus a Zod guard.
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

describe("POST /api/chat/messages — auth gate", () => {
  it("returns 401 when no session cookie is present", async () => {
    const app = buildApp()
    const res = await app.request("/api/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerPhone: "+34600000000",
        message: "hola",
      }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 401 regardless of body shape", async () => {
    const app = buildApp()
    const res = await app.request("/api/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hola" }),
    })
    expect(res.status).toBe(401)
  })
})
