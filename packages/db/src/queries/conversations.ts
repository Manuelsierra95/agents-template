import { and, asc, eq } from "drizzle-orm"

import type { DbClient } from "@workspace/db"
import {
  conversationMessage,
  customerConversation,
} from "@workspace/db/schema/chat"
import type {
  ConversationMessage,
  ConversationMessageKind,
  CustomerConversation,
  NewConversationMessage,
} from "@workspace/db/schema/chat"

/**
 * Conversation queries. Used by:
 *   - The operator UI (`GET /api/conversations`, `GET /api/conversations/:id`).
 *   - The agent runtime (`/eve/*` session stream) — events stream into
 *     `conversation_message` so the operator can replay history.
 *
 * # Why `kind` and `payload` (instead of typed columns)
 *
 * The agent emits four kinds of message (text in/out, tool call/result)
 * with very different shapes. Modelling each as a separate table
 * would multiply joins. Instead, the `payload` JSON column carries the
 * kind-specific shape and `kind` discriminates. Validation happens at
 * the API boundary, not in the schema.
 */

/**
 * Open a conversation for `(organization, customerPhone)`. Reuses an
 * existing match when present.
 */
export async function findOrCreateConversation(
  db: DbClient,
  args: { organizationId: string; customerPhone: string; title?: string },
): Promise<CustomerConversation> {
  const existing = await db
    .select()
    .from(customerConversation)
    .where(
      and(
        eq(customerConversation.organizationId, args.organizationId),
        eq(customerConversation.customerPhone, args.customerPhone),
      ),
    )
    .limit(1)
  const found = existing[0]
  if (found) return found

  const inserted = await db
    .insert(customerConversation)
    .values({
      organizationId: args.organizationId,
      customerPhone: args.customerPhone,
      title: args.title ?? null,
    })
    .returning()
  const created = inserted[0]
  if (!created) {
    throw new Error("findOrCreateConversation: insert returned no rows")
  }
  return created
}

export async function getConversationById(
  db: DbClient,
  args: { organizationId: string; id: string },
): Promise<CustomerConversation | undefined> {
  const rows = await db
    .select()
    .from(customerConversation)
    .where(
      and(
        eq(customerConversation.id, args.id),
        eq(customerConversation.organizationId, args.organizationId),
      ),
    )
    .limit(1)
  return rows[0]
}

export async function listConversations(
  db: DbClient,
  args: { organizationId: string; limit?: number },
): Promise<CustomerConversation[]> {
  return db
    .select()
    .from(customerConversation)
    .where(eq(customerConversation.organizationId, args.organizationId))
    .orderBy(asc(customerConversation.updatedAt))
    .limit(args.limit ?? 50)
}

/**
 * Append a message to a conversation.
 *
 * `payload` is the kind-specific JSON. For `inbound_text` and
 * `outbound_text` it carries `{ text: string }`; for `tool_call` and
 * `tool_result` it carries the JSON tool call/result. The function
 * does not validate the shape — that's the API layer's job.
 */
export async function appendMessage(
  db: DbClient,
  args: {
    conversationId: string
    role: string | null
    kind: ConversationMessageKind
    payload: Record<string, unknown>
  },
): Promise<ConversationMessage> {
  const row: NewConversationMessage = {
    conversationId: args.conversationId,
    role: args.role,
    kind: args.kind,
    payload: args.payload,
  }
  const inserted = await db.insert(conversationMessage).values(row).returning()
  const created = inserted[0]
  if (!created) {
    throw new Error("appendMessage: insert returned no rows")
  }
  return created
}

/**
 * Append a message and bump the conversation's `updatedAt` in a
 * single call. We do this in a transaction so the conversation
 * list always reflects the latest activity.
 */
export async function appendMessageAndTouchConversation(
  db: DbClient,
  args: {
    organizationId: string
    conversationId: string
    role: string | null
    kind: ConversationMessageKind
    payload: Record<string, unknown>
  },
): Promise<ConversationMessage> {
  const now = new Date()
  return db.transaction(async (tx) => {
    // Optimistic concurrency: only update the conversation if it
    // belongs to the calling organization.
    const updated = await tx
      .update(customerConversation)
      .set({ updatedAt: now })
      .where(
        and(
          eq(customerConversation.id, args.conversationId),
          eq(customerConversation.organizationId, args.organizationId),
        ),
      )
      .returning({ id: customerConversation.id })
    if (updated.length === 0) {
      throw new Error(
        `appendMessageAndTouchConversation: conversation ${args.conversationId} not found in organization ${args.organizationId}`,
      )
    }
    const inserted = await tx
      .insert(conversationMessage)
      .values({
        conversationId: args.conversationId,
        role: args.role,
        kind: args.kind,
        payload: args.payload,
      })
      .returning()
    const created = inserted[0]
    if (!created) {
      throw new Error("appendMessageAndTouchConversation: insert returned no rows")
    }
    return created
  })
}

export async function listMessages(
  db: DbClient,
  args: { organizationId: string; conversationId: string; limit?: number },
): Promise<ConversationMessage[]> {
  // Verify ownership before reading messages — keeps the response
  // scoped to the caller's org.
  const conv = await getConversationById(db, {
    organizationId: args.organizationId,
    id: args.conversationId,
  })
  if (!conv) return []
  return db
    .select()
    .from(conversationMessage)
    .where(eq(conversationMessage.conversationId, args.conversationId))
    .orderBy(asc(conversationMessage.createdAt))
    .limit(args.limit ?? 500)
}
