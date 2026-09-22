"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { ChatEntry } from "@/features/chat"

/**
 * `use-chat-stream` — wire-up between `apps/web`'s `<ChatPanel>` and
 * `apps/api`'s `POST /api/chat/messages` (which proxies to `apps/agent`'s
 * Eve runtime).
 *
 * The hook:
 *   1. POSTs `{ customerPhone, message, conversationId? }` to
 *      `/api/chat/messages`.
 *   2. Reads the response body as NDJSON.
 *   3. Translates each Eve event into a `ChatEntry`:
 *
 *      - `message.received`        → push `UserEntry`
 *      - `turn.started`             → status = "streaming"
 *      - `actions.requested`        → push `ToolEntry` (running)
 *      - `action.result`            → mark the matching `ToolEntry`
 *                                   as completed / failed
 *      - `message.appended`         → update the last assistant
 *                                   entry's text incrementally
 *      - `message.completed`        → set the last assistant entry's
 *                                   text to the authoritative final value
 *      - `turn.completed`           → status = "idle"
 *      - `turn.failed`/`session.failed` → status = "error"
 *
 * The returned `entries` is the only authoritative source of truth
 * for the UI. Mutations are scoped to the current `send()` call via
 * a per-turn sequence counter — stale events from a superseded turn
 * are dropped before they touch state.
 *
 * # Cancellation
 *
 * `cancel()` aborts the underlying fetch. Eve treats the abort as a
 * stream close and parks the turn. Local state stays as-is (no entry
 * is rolled back).
 *
 * # Reset
 *
 * `reset()` clears the local state AND cancels any in-flight stream.
 * The server-side conversation is preserved — the operator can
 * resume it from `GET /api/conversations/:id` — but the user starts
 * with an empty panel.
 */
export type ChatStatus = "idle" | "streaming" | "error"

export type UseChatStreamOptions = {
  /** Phone used to scope the conversation server-side. */
  customerPhone: string
  /**
   * Optional existing conversation id. When omitted, the server
   * calls `findOrCreateConversation` server-side.
   */
  conversationId?: string
}

export type UseChatStreamResult = {
  /** Authoritative entry list for the panel. */
  entries: ChatEntry[]
  /** Current stream status. */
  status: ChatStatus
  /** Last user-facing error, if any. Reset on the next send. */
  error: string | null
  /** The conversation id the server reports back via `x-conversation-id`. */
  conversationId: string | null
  /**
   * Send a user message. Streams the response into `entries` as
   * events arrive. Calling `send` while another turn is in flight
   * is a no-op — the previous stream must finish or be cancelled
   * first.
   */
  send: (text: string) => Promise<void>
  /** Abort the in-flight stream. */
  cancel: () => void
  /** Clear local state and abort the in-flight stream. */
  reset: () => void
}

/**
 * Minimal shape of an Eve stream event we care about. Other fields
 * are ignored — Eve's vocabulary is wide, and we only model the
 * events our UI renders.
 */
type EveStreamEvent = {
  type?: string
  data?: {
    text?: string
    message?: string | null
    finishReason?: string
    role?: string
    name?: string
    input?: unknown
    output?: unknown
    isError?: boolean
    error?: { message?: string }
    actions?: Array<{ type?: string; name?: string; input?: unknown }>
  }
  meta?: { id?: string }
}

export function useChatStream(options: UseChatStreamOptions): UseChatStreamResult {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [status, setStatus] = useState<ChatStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(
    options.conversationId ?? null,
  )

  // Refs that survive renders. `abortRef` is the AbortController for
  // the in-flight fetch (if any). `seqRef` tracks a per-turn counter
  // so stale events from a superseded turn don't mutate current state.
  const abortRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)

  const appendEntry = useCallback((entry: ChatEntry) => {
    setEntries((prev) => [...prev, entry])
  }, [])

  const updateLastEntry = useCallback(
    (kind: ChatEntry["kind"], patch: Partial<ChatEntry>) => {
      setEntries((prev) => {
        // Walk backwards to find the last entry of the requested
        // kind. Patches apply in-place.
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i]!.kind === kind) {
            const next = prev.slice()
            next[i] = { ...prev[i]!, ...patch } as ChatEntry
            return next
          }
        }
        return prev
      })
    },
    [],
  )

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setStatus("idle")
  }, [])

  const reset = useCallback(() => {
    cancel()
    setEntries([])
    setStatus("idle")
    setError(null)
    setConversationId(null)
  }, [cancel])

  /**
   * Translate a single NDJSON event into local state. The seq guard
   * drops stale events from a superseded turn.
   *
   * # Functional setState only
   *
   * Every state mutation goes through a functional setter
   * (`setEntries((prev) => ...)`). The captured `entries` in this
   * hook's closure can be stale across async boundaries — without
   * functional updates, late-arriving events would either miss
   * merges (treat every `message.appended` as a new agent entry)
   * or overwrite each other. Functional updates read the latest
   * committed state, which is what we want.
   */
  const handleEvent = useCallback((line: string, mySeq: number) => {
    if (mySeq !== seqRef.current) return
    let event: EveStreamEvent
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    const type = event.type
    const data = event.data ?? {}

    switch (type) {
      case "turn.started":
        setStatus("streaming")
        return
      case "turn.completed":
        // Only flip back to idle if no failure occurred. We can't
        // know from here whether a failure already fired — but the
        // caller (the `send()` body) tracks that and skips this when
        // status is already "error". Guard the transition so a
        // late `turn.completed` after `turn.failed` doesn't reset the
        // UI's error state.
        setStatus((prev) => (prev === "error" ? prev : "idle"))
        return
      case "turn.failed":
      case "session.failed": {
        const msg =
          typeof data.error?.message === "string"
            ? data.error.message
            : typeof data.message === "string"
              ? data.message
              : "Conversation failed."
        setStatus("error")
        setError(msg)
        return
      }
      case "input.requested":
        setStatus("error")
        setError(
          "The agent needs additional input before continuing. Refresh and retry.",
        )
        return
      case "actions.requested": {
        if (Array.isArray(data.actions)) {
          // Build all tool entries in a single setEntries call so
          // React commits them in one render.
          const newTools = data.actions.map((action) => ({
            id: `tool-${event.meta?.id ?? Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "tool" as const,
            tool: action.name ?? action.type ?? "tool",
            input: (action.input as Record<string, unknown>) ?? {},
            simulatedOutput: null,
            createdAt: Date.now(),
            status: "running" as const,
            callId: event.meta?.id,
          }))
          setEntries((prev) => [...prev, ...newTools])
        }
        return
      }
      case "action.result": {
        // Functional update: read the latest committed entries so we
        // find the most-recent running tool of this name correctly
        // even when several `action.result` events arrive in quick
        // succession.
        setEntries((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            const e = prev[i]!
            if (e.kind === "tool" && e.status === "running" && e.tool === data.name) {
              const next = prev.slice()
              next[i] = {
                ...e,
                status: data.isError ? "failed" : "completed",
                simulatedOutput:
                  (data.output as Record<string, unknown> | null) ?? null,
                errorMessage:
                  typeof data.error?.message === "string"
                    ? data.error.message
                    : undefined,
              }
              return next
            }
          }
          return prev
        })
        return
      }
      case "message.appended": {
        // Functional update reads the latest `entries`, avoiding the
        // stale-closure bug where every delta looks like a new agent.
        if (typeof data.text !== "string") return
        const delta = data.text
        setEntries((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.kind === "agent") {
            const next = prev.slice()
            next[next.length - 1] = {
              ...last,
              content: last.content + delta,
            } as ChatEntry
            return next
          }
          const newEntry: ChatEntry = {
            id: `agent-${event.meta?.id ?? Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "agent",
            content: delta,
            createdAt: Date.now(),
          }
          return [...prev, newEntry]
        })
        return
      }
      case "message.completed": {
        if (data.role === "assistant" && typeof data.message === "string") {
          const finalText = data.message
          // Same functional-update pattern: replace the last agent
          // entry's text with the authoritative final value, or append
          // if no delta was sent.
          setEntries((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.kind === "agent") {
              const next = prev.slice()
              next[next.length - 1] = { ...last, content: finalText } as ChatEntry
              return next
            }
            const newEntry: ChatEntry = {
              id: `agent-${event.meta?.id ?? Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              kind: "agent",
              content: finalText,
              createdAt: Date.now(),
            }
            return [...prev, newEntry]
          })
        }
        return
      }
      default:
        return
    }
  }, [])

  const send = useCallback(
    async (text: string) => {
      if (status === "streaming") return
      const trimmed = text.trim()
      if (!trimmed) return

      // Push the user entry immediately so the panel reflects the
      // input optimistically. The server persists on its end.
      const userEntryId = `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      appendEntry({
        id: userEntryId,
        kind: "user",
        content: trimmed,
        createdAt: Date.now(),
      })

      setStatus("streaming")
      setError(null)
      const mySeq = ++seqRef.current
      const controller = new AbortController()
      abortRef.current = controller

      let response: Response
      try {
        response = await fetch("/api/chat/messages", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerPhone: options.customerPhone,
            conversationId: conversationId ?? undefined,
            message: trimmed,
          }),
          signal: controller.signal,
        })
      } catch (err) {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : String(err)
        setStatus("error")
        setError(message)
        return
      }
      if (abortRef.current === controller) abortRef.current = null

      // Capture the conversation id from the response header.
      const newConvId = response.headers.get("x-conversation-id")
      // eslint-disable-next-line no-console
      console.log("[debug] x-conversation-id header =", newConvId)
      if (newConvId) setConversationId(newConvId)

      if (!response.body) {
        setStatus("error")
        setError("Empty response from server.")
        return
      }
      if (!response.ok) {
        // Non-streaming error — try to read the typed envelope.
        const errText = await response.text()
        setStatus("error")
        setError(errText.slice(0, 200) || `Server returned ${response.status}`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          if (mySeq !== seqRef.current) return // superseded by another send
          buffer += decoder.decode(value, { stream: true })
          // Eve emits one NDJSON event per line. Split and process
          // the complete events; the partial line at the end stays
          // in the buffer for the next chunk.
          let nlIdx = buffer.indexOf("\n")
          while (nlIdx !== -1) {
            const line = buffer.slice(0, nlIdx).trim()
            buffer = buffer.slice(nlIdx + 1)
            if (line) handleEvent(line, mySeq)
            nlIdx = buffer.indexOf("\n")
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : String(err)
        setStatus("error")
        setError(message)
        return
      }

      // Flush any trailing partial line.
      if (buffer.trim() && mySeq === seqRef.current) {
        handleEvent(buffer.trim(), mySeq)
      }
      // Flip back to idle only if a failure didn't leave status as
      // "error". `handleEvent` already guarded this for late
      // `turn.completed` events; the final flush is the same pattern.
      setStatus((prev) => (prev === "error" ? prev : "idle"))
    },
    [conversationId, handleEvent, options.customerPhone, status],
  )

  // Cancel any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
  }, [])

  return {
    entries,
    status,
    error,
    conversationId,
    send,
    cancel,
    reset,
  }
}
