import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

import type { ChatEntry } from "@/features/chat"
import { useChatStream } from "@/features/chat/use-chat-stream"

/**
 * `use-chat-stream` — unit tests with a mocked `fetch`.
 *
 * The hook reads NDJSON from `apps/api`'s `/api/chat/messages`
 * endpoint and projects each event into a `ChatEntry`. These tests
 * drive the hook with a `ReadableStream` shaped like Eve's wire
 * format and assert the projected state.
 */

// The WHATWG ReadableStream is needed for `Response` bodies; jsdom
// doesn't ship one. Bind Node's onto globalThis at module load.
// (We deliberately avoid touching TextEncoder — vitest + jsdom
// polyfill it, but the resulting constructor throws on `new`. We
// work around that by converting strings to bytes via `Buffer` in
// the helper below.)
import { ReadableStream } from "node:stream/web"
;(
  globalThis as unknown as { ReadableStream: typeof ReadableStream }
).ReadableStream = ReadableStream

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Build a `Response` that streams the given NDJSON lines. Each line
 * is pushed as its own chunk so the hook's per-line splitting has to
 * work with incomplete trailing data.
 */
function ndjsonResponse(
  lines: string[],
  init: { status?: number; convId?: string } = {}
): Response {
  // Buffer-based bytes (avoids TextEncoder, which is broken under
  // vitest + jsdom at the time of writing).
  const bytes = lines.map((l) => Buffer.from(l + "\n", "utf8"))
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of bytes) {
        controller.enqueue(
          new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        )
      }
      controller.close()
    },
  })
  const headers = new Headers({ "content-type": "application/x-ndjson" })
  if (init.convId) headers.set("x-conversation-id", init.convId)
  return new Response(stream as unknown as BodyInit, {
    status: init.status ?? 200,
    headers,
  })
}

function makeFetchSpy(): ReturnType<typeof vi.fn> {
  return vi.fn() as unknown as ReturnType<typeof vi.fn>
}

describe("use-chat-stream — happy path", () => {
  it("appends a user entry optimistically, then streams Eve events into entries", async () => {
    const fetchSpy = makeFetchSpy()
    fetchSpy.mockResolvedValue(
      ndjsonResponse(
        [
          JSON.stringify({ type: "turn.started" }),
          JSON.stringify({
            type: "message.appended",
            data: { text: "Hola, " },
            meta: { id: "evt-1" },
          }),
          JSON.stringify({
            type: "message.appended",
            data: { text: "¿qué tal?" },
            meta: { id: "evt-2" },
          }),
          JSON.stringify({
            type: "message.completed",
            data: { role: "assistant", message: "Hola, ¿qué tal?" },
            meta: { id: "evt-3" },
          }),
          JSON.stringify({ type: "turn.completed" }),
        ],
        { convId: "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa" }
      )
    )
    ;(globalThis as { fetch: unknown }).fetch = fetchSpy

    const { result } = renderHook(() =>
      useChatStream({ customerPhone: "+34600000000" })
    )

    await act(async () => {
      await result.current.send("Hola")
    })

    // First entry is the optimistic user entry.
    const entries = result.current.entries as ChatEntry[]
    expect(entries.length).toBeGreaterThan(0)
    const first = entries[0]
    expect(first?.kind).toBe("user")
    // `content` lives on `UserEntry`; narrow via the discriminant.
    if (first?.kind === "user") {
      expect(first.content).toBe("Hola")
    }

    // The agent entry is appended on `message.appended` and updated on
    // `message.completed`.
    const agentEntries = entries.filter((e) => e.kind === "agent")
    expect(agentEntries.length).toBe(1)
    expect(agentEntries.at(-1)?.content).toBe("Hola, ¿qué tal?")

    // The conversation id round-trips via the response header.
    expect(result.current.conversationId).toBe(
      "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa"
    )

    // Status returns to idle at the end of the stream.
    expect(result.current.status).toBe("idle")
    expect(result.current.error).toBeNull()
  })

  it("records tool calls from actions.requested and tool results from action.result", async () => {
    const fetchSpy = makeFetchSpy()
    fetchSpy.mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ type: "turn.started" }),
        JSON.stringify({
          type: "actions.requested",
          data: {
            actions: [
              {
                type: "tool-call",
                name: "check_availability",
                input: { date: "2025-01-15" },
              },
              {
                type: "tool-call",
                name: "create_booking",
                input: { date: "2025-01-15", time: "10:00" },
              },
            ],
          },
          meta: { id: "call-1" },
        }),
        JSON.stringify({
          type: "action.result",
          data: {
            name: "check_availability",
            output: { available: true },
            isError: false,
          },
          meta: { id: "call-1" },
        }),
        JSON.stringify({
          type: "action.result",
          data: {
            name: "create_booking",
            output: { bookingId: "b1" },
            isError: false,
          },
          meta: { id: "call-2" },
        }),
        JSON.stringify({
          type: "message.completed",
          data: { role: "assistant", message: "Reservado." },
          meta: { id: "evt-final" },
        }),
        JSON.stringify({ type: "turn.completed" }),
      ])
    )
    ;(globalThis as { fetch: unknown }).fetch = fetchSpy

    const { result } = renderHook(() =>
      useChatStream({ customerPhone: "+34600000000" })
    )
    await act(async () => {
      await result.current.send("¿Tenéis hueco?")
    })

    const tools = (result.current.entries as ChatEntry[]).filter(
      (e) => e.kind === "tool"
    )
    expect(tools.length).toBe(2)
    expect(tools[0]?.tool).toBe("check_availability")
    expect(tools[1]?.tool).toBe("create_booking")
    // Both marked completed after their respective action.result.
    expect(tools[0]?.status).toBe("completed")
    expect(tools[1]?.status).toBe("completed")
    expect(tools[0]?.simulatedOutput).toEqual({ available: true })
    expect(tools[1]?.simulatedOutput).toEqual({ bookingId: "b1" })
  })

  it("surfaces a turn.failed event as an error status with the message", async () => {
    const fetchSpy = makeFetchSpy()
    fetchSpy.mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ type: "turn.started" }),
        JSON.stringify({
          type: "turn.failed",
          data: { error: { message: "Jev returned low confidence." } },
        }),
      ])
    )
    ;(globalThis as { fetch: unknown }).fetch = fetchSpy

    const { result } = renderHook(() =>
      useChatStream({ customerPhone: "+34600000000" })
    )
    await act(async () => {
      await result.current.send("x")
    })

    expect(result.current.status).toBe("error")
    expect(result.current.error).toBe("Jev returned low confidence.")
  })
})

describe("use-chat-stream — cancellation", () => {
  it("cancel() aborts the in-flight fetch and resets status", async () => {
    let rejectFn: (err: Error) => void = () => undefined
    const fetchSpy = makeFetchSpy()
    fetchSpy.mockReturnValue(
      new Promise<Response>((_resolve, reject) => {
        rejectFn = reject
      })
    )
    ;(globalThis as { fetch: unknown }).fetch = fetchSpy

    const { result } = renderHook(() =>
      useChatStream({ customerPhone: "+34600000000" })
    )

    act(() => {
      void result.current.send("never reaches the server")
    })
    // Wait for the status to flip to "streaming" before cancelling.
    await act(async () => {
      // one tick to let the promise reach `fetchSpy`
      await Promise.resolve()
    })
    expect(result.current.status).toBe("streaming")

    act(() => {
      result.current.cancel()
    })
    // The pending promise rejects with AbortError; the hook swallows
    // it (it's the user-initiated cancellation).
    rejectFn(new DOMException("aborted", "AbortError"))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.status).toBe("idle")
  })
})

describe("use-chat-stream — reset", () => {
  it("reset() clears entries, conversationId, error, and status", async () => {
    const fetchSpy = makeFetchSpy()
    fetchSpy.mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ type: "turn.started" }),
        JSON.stringify({
          type: "message.completed",
          data: { role: "assistant", message: "Hola" },
        }),
        JSON.stringify({ type: "turn.completed" }),
      ])
    )
    ;(globalThis as { fetch: unknown }).fetch = fetchSpy

    const { result } = renderHook(() =>
      useChatStream({ customerPhone: "+34600000000" })
    )
    await act(async () => {
      await result.current.send("hola")
    })
    expect((result.current.entries as ChatEntry[]).length).toBeGreaterThan(0)

    act(() => {
      result.current.reset()
    })

    // `reset()` issues four state setters; React commits them in one
    // batched render, but `renderHook` only updates `result.current`
    // after that render flushes. waitFor gives React a chance to commit.
    await waitFor(() => {
      expect(result.current.entries).toEqual([])
      expect(result.current.conversationId).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.status).toBe("idle")
    })
  })
})

describe("use-chat-stream — error handling", () => {
  it("network failure surfaces as error status with the error message", async () => {
    const fetchSpy = makeFetchSpy()
    fetchSpy.mockRejectedValue(new Error("network down"))
    ;(globalThis as { fetch: unknown }).fetch = fetchSpy

    const { result } = renderHook(() =>
      useChatStream({ customerPhone: "+34600000000" })
    )
    await act(async () => {
      await result.current.send("hola")
    })

    expect(result.current.status).toBe("error")
    expect(result.current.error).toBe("network down")
  })

  it("non-OK HTTP status surfaces the response body as the error", async () => {
    const fetchSpy = makeFetchSpy()
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "AGENT_UNREACHABLE", message: "Eve is down." },
        }),
        { status: 502, headers: { "content-type": "application/json" } }
      )
    )
    ;(globalThis as { fetch: unknown }).fetch = fetchSpy

    const { result } = renderHook(() =>
      useChatStream({ customerPhone: "+34600000000" })
    )
    await act(async () => {
      await result.current.send("hola")
    })

    expect(result.current.status).toBe("error")
    expect(result.current.error).toContain("Eve is down.")
  })
})

describe("use-chat-stream — request shape", () => {
  it("POSTs to /api/chat/messages with the conversation and message payload", async () => {
    const fetchSpy = makeFetchSpy()
    fetchSpy.mockResolvedValue(
      ndjsonResponse([JSON.stringify({ type: "turn.completed" })])
    )
    ;(globalThis as { fetch: unknown }).fetch = fetchSpy

    const { result } = renderHook(() =>
      useChatStream({ customerPhone: "+34600000000" })
    )
    await act(async () => {
      await result.current.send("hola")
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/chat/messages")
    expect(init.method).toBe("POST")
    expect(init.credentials).toBe("include")
    expect(JSON.parse(init.body as string)).toEqual({
      customerPhone: "+34600000000",
      message: "hola",
    })
  })
})
