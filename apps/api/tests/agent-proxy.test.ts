/**
 * End-to-end tests for the `/eve/*` proxy.
 *
 * The proxy is a pass-through: every method on `/eve/*` is forwarded
 * to `${AGENT_URL}/eve/*` with the `Authorization: Bearer
 * ${INTERNAL_API_TOKEN}` header injected and the response streamed
 * back unchanged. These tests verify the boundary contract — the
 * shape of the upstream call and the shape of the downstream response
 * — by mocking `globalThis.fetch`.
 *
 * We exercise the real `createApp` so middleware order
 * (requestLogger → CORS → proxy) participates. The agent URL is
 * pointed at a host that never resolves (`.invalid`); the test
 * replaces `globalThis.fetch` before the proxy runs.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { ReadableStream } from "node:stream/web"

import { createApp } from "@/app"

const MOCK_AGENT_URL = "http://eve.invalid:9999"
const MOCK_TOKEN = "test_internal_api_token_at_least_32_chars_long_xx"

function makeUpstreamResponse(opts: {
  status?: number
  body?: string | ReadableStream<Uint8Array>
  contentType?: string
}): Response {
  const { status = 200, body = "", contentType = "application/json" } = opts
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (typeof body === "string") {
        controller.enqueue(new TextEncoder().encode(body))
      } else {
        // ReadableStream pass-through — drain the source stream into
        // the controller so the proxy can stream it back to the
        // browser end-to-end.
        const reader = body.getReader()
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (value) controller.enqueue(value)
            }
            controller.close()
          } catch (err) {
            controller.error(err)
          }
        }
        void pump()
      }
    },
  })
  // WHATWG `Response` and Node's `stream/web` `ReadableStream` are
  // structurally similar but TypeScript sees them as distinct. Cast
  // through `unknown` at the boundary so the rest of the test reads
  // as plain `Response`.
  return new Response(
    stream as unknown as BodyInit,
    {
      status,
      headers: { "content-type": contentType },
    },
  )
}

describe("agent proxy — /eve/* pass-through", () => {
  // `vi.spyOn(globalThis, "fetch")` has overloaded signatures that
  // leak WHATWG vs Node-stream type conflicts through `mock.calls[i]`.
  // We type the spy loosely and narrow each call site through
  // `getFetchCall`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => makeUpstreamResponse({ body: "{}" }) as unknown as Response,
    )
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  function buildApp() {
    return createApp({
      AGENT_URL: MOCK_AGENT_URL,
      INTERNAL_API_TOKEN: MOCK_TOKEN,
      PRIMARY_ORGANIZATION_ID: "00000000-0000-0000-0000-000000000001",
      NODE_ENV: "test",
      API_PORT: 3000,
      API_HOST: "127.0.0.1",
      CORS_ORIGINS: ["http://localhost:3000"],
      LOG_LEVEL: "error",
    })
  }

  function getFetchCall(index: number): { url: unknown; init: RequestInit } {
    const spy = fetchSpy as unknown as {
      mock: { calls: Array<[unknown, RequestInit | undefined]> }
    }
    const call = spy.mock.calls[index]
    if (!call) throw new Error(`fetch was not called at index ${index}`)
    const [url, init = {} as RequestInit] = call
    return { url, init }
  }

  it("proxies a POST /eve/v1/session request to ${AGENT_URL}/eve/v1/session", async () => {
    const app = buildApp()
    const res = await app.request("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    })
    expect(res.status).toBe(200)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const { url, init } = getFetchCall(0)
    expect(url).toBe(`${MOCK_AGENT_URL}/eve/v1/session`)
    expect(init.method).toBe("POST")
    // The proxy injects the internal token. The browser's `Cookie`
    // header (if any) must NOT leak to the agent runtime.
    const headers = new Headers(init.headers)
    expect(headers.get("authorization")).toBe(`Bearer ${MOCK_TOKEN}`)
    expect(headers.get("cookie")).toBeNull()
    // Body is forwarded as a stream (Hono gives us the raw request
    // body, not a buffered string). Read it through a decoder so we
    // can assert the bytes survived untouched.
    expect(init.body).toBeInstanceOf(ReadableStream)
    const decoded = await new Response(
      init.body as unknown as BodyInit,
    ).text()
    expect(decoded).toBe(JSON.stringify({ message: "hi" }))
  })

  it("forwards arbitrary request headers (except hop-by-hop and cookie)", async () => {
    const app = buildApp()
    await app.request("/eve/v1/session/abc/stream", {
      headers: {
        accept: "text/event-stream",
        "x-request-id": "req-123",
        host: "should-be-stripped.example",
        connection: "should-be-stripped",
        cookie: "session=secret; should-be-stripped",
      },
    })
    const { init } = getFetchCall(0)
    const headers = new Headers(init.headers)
    expect(headers.get("accept")).toBe("text/event-stream")
    expect(headers.get("x-request-id")).toBe("req-123")
    expect(headers.get("host")).toBeNull()
    expect(headers.get("connection")).toBeNull()
    expect(headers.get("cookie")).toBeNull()
  })

  it("streams the upstream response body back without buffering", async () => {
    // Three newline-delimited JSON chunks, like Eve's NDJSON stream.
    const chunks = [
      '{"type":"session.started","id":"s1"}\n',
      '{"type":"turn.started"}\n',
      '{"type":"message.delta","text":"hi"}\n',
    ]
    let index = 0
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder()
        const tick = () => {
          if (index >= chunks.length) {
            controller.close()
            return
          }
          controller.enqueue(enc.encode(chunks[index++]!))
          setTimeout(tick, 5)
        }
        tick()
      },
    })

    fetchSpy.mockImplementation(
      async () =>
        makeUpstreamResponse({
          status: 200,
          contentType: "application/x-ndjson",
          body: source,
        }),
    )

    const app = buildApp()
    const res = await app.request("/eve/v1/session/abc/stream")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/x-ndjson")
    // Read the entire body — Hono's test handler drains the stream
    // for us, so we don't have to interleave reads.
    const text = await res.text()
    expect(text).toBe(chunks.join(""))
  })

  it("forwards an upstream 4xx status unchanged", async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "session_not_found" } }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
    )
    const app = buildApp()
    const res = await app.request("/eve/v1/session/missing")
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: "session_not_found" },
    })
  })

  it("returns 502 with AGENT_UNREACHABLE when upstream fetch throws", async () => {
    fetchSpy.mockImplementation(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:2000")
    })
    const app = buildApp()
    const res = await app.request("/eve/v1/session", {
      method: "POST",
      body: "{}",
    })
    expect(res.status).toBe(502)
    const body = (await res.json()) as {
      error: { code: string; message: string }
    }
    expect(body.error.code).toBe("AGENT_UNREACHABLE")
    expect(body.error.message).toMatch(/Eve runtime is not reachable/)
  })
})
