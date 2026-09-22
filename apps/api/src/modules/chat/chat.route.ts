import { Hono } from "hono"
import { z } from "zod"

import { db as defaultDb, type DbClient } from "@workspace/db"
import {
  appendMessage,
  appendMessageAndTouchConversation,
  findOrCreateConversation,
  getConversationById,
} from "@workspace/db/queries/conversations"
import { asStatus, errorBody } from "@/lib/responses"
import { logger } from "@/lib/logger"
import type { AppEnv } from "@/app"

/**
 * `POST /api/chat` — authenticated chat entry-point.
 *
 * Bridges the browser and Eve's runtime:
 *
 *   1. Validates the body (`conversationId?`, `customerPhone`, `message`).
 *   2. Reuses the conversation if `conversationId` is given and owned
 *      by the caller's organization; otherwise calls
 *      `findOrCreateConversation` to open a fresh one for
 *      `(organizationId, customerPhone)`.
 *   3. Persists the inbound message.
 *   4. POSTs to `apps/agent`'s `/eve/v1/session/:id/messages`.
 *   5. Streams Eve's NDJSON response back to the browser while
 *      accumulating outbound events for persistence:
 *        - `message.appended` / `message.completed` are accumulated
 *          and persisted as a single `outbound_text` at the end.
 *        - `action.result` is persisted as `tool_result` immediately.
 *   6. Persists the final assistant text and touches the conversation
 *      row so the operator UI sees fresh timestamps.
 *
 * # Multi-tenancy
 *
 * Scoping flows from the session: `c.var.auth.organizationId`. We
 * never trust client-supplied organization IDs. Every query and
 * every persistence call passes the auth-scoped org.
 *
 * # Auth contract
 *
 * The browser posts with the user's session cookie. `requireAuth`
 * populates `c.var.auth`; the agent-side upstream call carries the
 * service-to-service `INTERNAL_API_TOKEN` (injected by the Eve
 * proxy inside `apps/api`, not by the browser).
 *
 * # Failure modes
 *
 *   - Invalid body              → 400 `INVALID_CHAT_REQUEST`
 *   - Conversation not found    → 404 `CONVERSATION_NOT_FOUND`
 *   - Eve unreachable           → 502 `AGENT_UNREACHABLE`
 *
 * Streaming failures during the conversation (Eve sends garbage,
 * upstream closes unexpectedly) surface as a `turn.failed` line at
 * the end of the NDJSON stream. The browser's `use-chat-stream`
 * hook treats that as the terminal state.
 */

const phoneSchema = z
  .string()
  .min(8)
  .max(20)
  .regex(/^\+?[0-9\s()-]+$/u, "Phone must contain only digits and standard separators")

const bodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  customerPhone: phoneSchema,
  message: z.string().min(1).max(8000),
})

function resolveAgentBaseUrl(env: NodeJS.ProcessEnv): string {
  const value = env.AGENT_URL
  if (!value) {
    throw new Error(
      "AGENT_URL is required to call Eve. Set it in apps/api/.env (matches apps/agent/.env).",
    )
  }
  return value.replace(/\/$/, "")
}

export type ChatRouteOptions = {
  /** Optional DB override — tests inject a fake. */
  db?: DbClient
  /**
   * Override the apps/api → apps/agent hop. Tests inject a `fetch`-
   * compatible stub here. Defaults to `globalThis.fetch`.
   */
  fetch?: typeof globalThis.fetch
  /**
   * Override the upstream URL. Defaults to `process.env.AGENT_URL`.
   * Tests inject their own (e.g. a localhost mock server).
   */
  agentBaseUrl?: string
}

export function makeChatRoute(options: ChatRouteOptions = {}) {
  const db = options.db ?? defaultDb
  const fetchImpl: typeof globalThis.fetch =
    options.fetch ?? globalThis.fetch.bind(globalThis)
  const agentBaseUrl = options.agentBaseUrl ?? resolveAgentBaseUrl(process.env)

  const route = new Hono<{ Variables: AppEnv["Variables"] }>()

  route.post("/", async (c) => {
    const auth = c.get("auth")
    if (!auth) {
      // requireAuth guards this path; defensive only.
      return c.json(
        errorBody("UNAUTHORIZED", "Authentication required."),
        asStatus(401),
      )
    }

    const rawBody = await c.req.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return c.json(
        errorBody(
          "INVALID_CHAT_REQUEST",
          parsed.error.issues[0]?.message ?? "Invalid chat request",
        ),
        asStatus(400),
      )
    }
    const { conversationId, customerPhone, message } = parsed.data

    // Resolve the conversation (reuse or create). When the caller
    // supplies an id, verify it belongs to this org before persisting
    // against it — a leaked id from a different tenant would leak
    // the new message into that conversation.
    let conversationIdToUse: string
    if (conversationId) {
      const existing = await getConversationById(db, {
        organizationId: auth.organizationId,
        id: conversationId,
      })
      if (!existing) {
        return c.json(
          errorBody(
            "CONVERSATION_NOT_FOUND",
            `Conversation ${conversationId} not found in this organization.`,
          ),
          asStatus(404),
        )
      }
      conversationIdToUse = existing.id
    } else {
      const created = await findOrCreateConversation(db, {
        organizationId: auth.organizationId,
        customerPhone,
      })
      conversationIdToUse = created.id
    }

    // Persist the inbound message BEFORE opening the upstream
    // stream. If the upstream fails, the user's input still lives
    // on disk — an operator can resume the conversation later.
    await appendMessage(db, {
      conversationId: conversationIdToUse,
      role: "user",
      kind: "inbound_text",
      payload: { text: message },
    })

    // Open the stream from Eve and pipe it back to the client.
    let upstream: Response
    try {
      upstream = await fetchImpl(
        `${agentBaseUrl}/eve/v1/session/${conversationIdToUse}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
        },
      )
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "chat route: eve upstream unreachable",
      )
      return c.json(
        errorBody(
          "AGENT_UNREACHABLE",
          "Eve runtime is not reachable. Is apps/agent running?",
        ),
        asStatus(502),
      )
    }

    if (!upstream.body) {
      return c.json(
        errorBody("AGENT_UNREACHABLE", "Eve returned no response body."),
        asStatus(502),
      )
    }

    return forwardStreamWithPersistence({
      upstream,
      conversationId: conversationIdToUse,
      organizationId: auth.organizationId,
      db,
    })
  })

  return route
}

/**
 * Forward Eve's NDJSON to the browser while accumulating outbound
 * events for persistence. The browser sees the raw NDJSON; the
 * persistence side reads the same bytes (after they were enqueued
 * to the browser stream) and writes them to the conversation row.
 *
 * We hand-roll a manual tee here rather than using
 * `ReadableStream.tee()` because the latter is one-shot — once one
 * leg is consumed, the other leg cannot be re-read.
 */
function forwardStreamWithPersistence(args: {
  upstream: Response
  conversationId: string
  organizationId: string
  db: DbClient
}): Response {
  const { upstream, conversationId, organizationId, db } = args
  const reader = upstream.body!.getReader()
  const decoder = new TextDecoder()

  // Per-event accumulator state.
  let assistantTextAccumulator = ""

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read()
        if (done) {
          controller.close()
          await persistFinalAssistantText(
            db,
            organizationId,
            conversationId,
            assistantTextAccumulator,
          )
          return
        }
        // Forward the raw bytes to the browser.
        controller.enqueue(value)
        // Decode a copy for persistence. Eve's NDJSON is one event per
        // line, but text deltas (`message.appended`) can also arrive
        // as fragments without newlines — we accumulate regardless
        // and let `message.completed` overwrite with the final value.
        const chunk = decoder.decode(value, { stream: true })
        try {
          for (const rawLine of chunk.split("\n")) {
            const line = rawLine.trim()
            if (!line) continue
            const event = JSON.parse(line) as {
              type?: string
              data?: {
                text?: string
                message?: string | null
                toolName?: string
                output?: unknown
              }
            }
            switch (event.type) {
              case "message.appended":
                if (typeof event.data?.text === "string") {
                  assistantTextAccumulator += event.data.text
                }
                break
              case "message.completed":
                if (typeof event.data?.message === "string") {
                  assistantTextAccumulator = event.data.message
                }
                break
              case "action.result":
                if (event.data?.toolName) {
                  await appendMessage(db, {
                    conversationId,
                    role: null,
                    kind: "tool_result",
                    payload: {
                      toolName: event.data.toolName,
                      output: event.data.output ?? null,
                    },
                  }).catch(() => undefined)
                }
                break
              default:
                break
            }
          }
        } catch {
          // Swallow parse errors so the browser still gets raw bytes
          // even if a single line is malformed. Eve is the source of
          // truth; if it sends garbage, the consumer logs and renders
          // nothing.
        }
      } catch (err) {
        controller.error(err)
      }
    },
    cancel() {
      // Browser closed the connection (e.g. unmount). Cancel the
      // upstream so Eve stops working.
      try {
        reader.cancel()
      } catch {
        // best-effort
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-cache",
      "x-conversation-id": conversationId,
    },
  })
}

/**
 * Persist the final assistant message once Eve has finished
 * streaming. Best-effort: errors are logged but never throw into
 * the request flow (the client already has the answer).
 */
async function persistFinalAssistantText(
  db: DbClient,
  organizationId: string,
  conversationId: string,
  text: string,
): Promise<void> {
  if (!text) return
  try {
    await appendMessageAndTouchConversation(db, {
      organizationId,
      conversationId,
      role: "assistant",
      kind: "outbound_text",
      payload: { text },
    })
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "chat route: failed to persist final assistant text",
    )
  }
}
