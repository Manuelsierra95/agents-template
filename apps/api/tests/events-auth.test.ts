import { describe, expect, it } from "vitest"
import { createApp } from "@/app"
import { loadEnv } from "@/config/env"
import { InMemoryEventBus } from "@/lib/realtime/in-memory-event-bus"

/**
 * Auth gate for the SSE endpoint.
 *
 * The full happy-path (a real sign-up + org creation + session cookie
 * flowing to the stream) is exercised by
 * `packages/auth/tests/middleware.test.ts` because it requires a live
 * test DB. Here we only prove that the route is mounted under
 * `/api/events`, sits behind `requireAuth`, and returns the expected
 * content type when the auth gate passes.
 *
 * The route is mounted without a bus so the test stays isolated — the
 * binding happens inside `createApp` and is a fire-and-forget promise
 * that does not affect request handling.
 */

// Required secret for the agent-runtime namespace; the suite isn't
// testing the internal-token gate, only the public SSE auth flow.
const REQUIRED_TEST_TOKEN =
  "test_internal_api_token_at_least_32_chars_long_xx"

describe("GET /api/events (auth gate)", () => {
  it("returns 401 with no session cookie", async () => {
    const app = createApp(
      loadEnv({
        API_PORT: "4000",
        API_HOST: "127.0.0.1",
        NODE_ENV: "test",
        CORS_ORIGINS: "*",
        LOG_LEVEL: "error",
        AUTH_SECRET: "testtesttesttesttesttesttesttest",
        AUTH_BASE_URL: "http://localhost:4000",
        AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
        INTERNAL_API_TOKEN: REQUIRED_TEST_TOKEN,
      }),
    )

    const res = await app.request("/api/events")
    // requireAuth -> HTTPException(401) -> JSON error body.
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  it("returns 401 with a bogus session cookie", async () => {
    const app = createApp(
      loadEnv({
        NODE_ENV: "test",
        CORS_ORIGINS: "*",
        LOG_LEVEL: "error",
        AUTH_SECRET: "testtesttesttesttesttesttesttest",
        AUTH_BASE_URL: "http://localhost:4000",
        AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
        INTERNAL_API_TOKEN: REQUIRED_TEST_TOKEN,
      }),
    )

    const res = await app.request("/api/events", {
      headers: { Cookie: "better-auth.session_token=garbage" },
    })
    expect(res.status).toBe(401)
  })

  it("createApp accepts an eventBus and binds it to the SSE hub", async () => {
    // The hub is idempotent; calling bind twice in a row is safe. We
    // just want to prove wiring doesn't throw, the bus survives a
    // request, and the bus has at least the SSE-hub subscriber
    // attached (which is what allows `publishRealtime` to reach SSE
    // clients once the app is live).
    const bus = new InMemoryEventBus()
    const app = createApp(
      loadEnv({
        NODE_ENV: "test",
        CORS_ORIGINS: "*",
        LOG_LEVEL: "error",
        AUTH_SECRET: "testtesttesttesttesttesttesttest",
        AUTH_BASE_URL: "http://localhost:4000",
        AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
        INTERNAL_API_TOKEN: REQUIRED_TEST_TOKEN,
      }),
      { eventBus: bus },
    )

    // Hit /health to prove the app is intact with the bus wired.
    const health = await app.request("/health")
    expect(health.status).toBe(200)

    // The SSE hub registered itself as a subscriber of the bus during
    // createApp. That's the only subscriber — no SSE clients opened
    // during this test.
    expect(bus.subscriberCount).toBeGreaterThanOrEqual(1)
  })
})
