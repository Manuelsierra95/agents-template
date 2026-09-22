import { Hono } from "hono"
import { z } from "zod"

import { db as defaultDb, type DbClient } from "@workspace/db"
import {
  findOrCreateConversation,
  getConversationById,
  listConversations,
  listMessages,
} from "@workspace/db/queries/conversations"
import { asStatus, errorBody } from "@/lib/responses"
import type { AppEnv } from "@/app"

/**
 * `/api/conversations` — operator-facing read endpoints.
 *
 * # Auth model
 *
 * These routes are session-authenticated (`requireAuth`) so the
 * operator UI can list threads. Multi-tenant scoping flows from the
 * session: `ctx.var.auth.organizationId` is injected into every
 * query.
 *
 * # Endpoints
 *
 *   - `GET /`             — list the caller's conversations.
 *   - `GET /:id`          — fetch one conversation with its messages.
 *
 * Write paths (create / append) live behind the agent's stream
 * (Phase 2C). The conversation row is created lazily by the agent
 * on first user message via `findOrCreateConversation`.
 */

const idSchema = z.string().uuid()

function serialize(
  conversation: Awaited<ReturnType<typeof getConversationById>>,
) {
  if (!conversation) return null
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    customerPhone: conversation.customerPhone,
    title: conversation.title,
    state: conversation.state,
    createdAt:
      conversation.createdAt instanceof Date
        ? conversation.createdAt.toISOString()
        : String(conversation.createdAt),
    updatedAt:
      conversation.updatedAt instanceof Date
        ? conversation.updatedAt.toISOString()
        : String(conversation.updatedAt),
  }
}

export type ConversationRouteOptions = {
  db?: DbClient
}

export function makeConversationRoute(options: ConversationRouteOptions = {}) {
  const db = options.db ?? defaultDb
  const route = new Hono<{ Variables: AppEnv["Variables"] }>()

  // `requireAuth` is applied by the parent `api` namespace; this route
  // assumes `c.var.auth` is populated.
  route.get("/", async (c) => {
    const auth = c.get("auth")
    if (!auth) {
      // Defensive — the `requireAuth` middleware on the parent
      // namespace guarantees this, but keep the type narrow.
      return c.json(
        errorBody("UNAUTHORIZED", "Authentication required."),
        asStatus(401),
      )
    }
    const conversations = await listConversations(db, {
      organizationId: auth.organizationId,
    })
    return c.json({
      conversations: conversations.map(serialize),
    })
  })

  route.get("/:id", async (c) => {
    const auth = c.get("auth")
    if (!auth) {
      return c.json(
        errorBody("UNAUTHORIZED", "Authentication required."),
        asStatus(401),
      )
    }
    const idParse = idSchema.safeParse(c.req.param("id"))
    if (!idParse.success) {
      return c.json(
        errorBody("INVALID_ID", "conversation id must be a UUID"),
        asStatus(400),
      )
    }
    const conversation = await getConversationById(db, {
      organizationId: auth.organizationId,
      id: idParse.data,
    })
    if (!conversation) {
      return c.json(
        errorBody("NOT_FOUND", "Conversation not found."),
        asStatus(404),
      )
    }
    const messages = await listMessages(db, {
      organizationId: auth.organizationId,
      conversationId: idParse.data,
    })
    return c.json({
      conversation: serialize(conversation),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        kind: m.kind,
        payload: m.payload,
        createdAt:
          m.createdAt instanceof Date
            ? m.createdAt.toISOString()
            : String(m.createdAt),
      })),
    })
  })

  return route
}

// Re-export `findOrCreateConversation` so the agent-side code (when it
// exists in Phase 2C) can reuse the same query rather than open a
// second connection from scratch.
export { findOrCreateConversation }
