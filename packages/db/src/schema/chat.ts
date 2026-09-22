import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

import { organization } from "@workspace/db/schema/auth"

/**
 * `customer_conversations` — one row per (organization, customer) chat
 * thread with the agent. Persists the conversation metadata so the
 * operator UI can list threads and resume them across agent sessions.
 *
 * `organizationId` is `text` to match `organization.id` (Better Auth).
 *
 * `state` is a JSON blob that captures transient per-thread state
 * (last action decided by Jev, current step index, queued follow-ups).
 * The structure is opaque to the DB; validation lives in the API layer.
 */
export const customerConversation = pgTable(
  "customer_conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Customer phone (E.164) — we don't FK to `customer.id` so a
    // conversation can be opened before the customer record exists
    // (cold lead). Phase 2D matches the phone later.
    customerPhone: text("customer_phone").notNull(),
    title: text("title"),
    state: jsonb("state")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgIdx: index("customer_conversation_org_idx").on(t.organizationId),
    orgPhoneIdx: index("customer_conversation_org_phone_idx").on(
      t.organizationId,
      t.customerPhone
    ),
  })
)

/**
 * `conversation_message` — every inbound and outbound message in a
 * conversation, plus tool-call events emitted by the agent.
 *
 * `kind`:
 *   - `"inbound_text"` — user message received.
 *   - `"outbound_text"` — agent reply.
 *   - `"tool_call"` — tool invocation (with `payload` carrying the
 *     JSON serialised tool call).
 *   - `"tool_result"` — tool execution result.
 *
 * `role` mirrors the AI SDK's `system` / `user` / `assistant` split
 * when `kind` is a text message, and is `null` for tool events.
 *
 * `payload` is JSON-serialisable state. For text messages it carries
 * `{ text: string }`; for tool events it carries the JSON tool
 * call/result. Stored as `jsonb` so the schema can evolve without a
 * migration every time a new tool is added.
 */
export const conversationMessageKind = [
  "inbound_text",
  "outbound_text",
  "tool_call",
  "tool_result",
] as const
export type ConversationMessageKind = (typeof conversationMessageKind)[number]

export const conversationMessage = pgTable(
  "conversation_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => customerConversation.id, { onDelete: "cascade" }),
    role: text("role"), // `system` | `user` | `assistant` | null for tool events
    kind: text("kind").$type<ConversationMessageKind>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    conversationCreatedIdx: index(
      "conversation_message_conversation_created_idx"
    ).on(t.conversationId, t.createdAt),
  })
)

export const customerConversationRelations = relations(
  customerConversation,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [customerConversation.organizationId],
      references: [organization.id],
    }),
    messages: many(conversationMessage),
  })
)

export const conversationMessageRelations = relations(
  conversationMessage,
  ({ one }) => ({
    conversation: one(customerConversation, {
      fields: [conversationMessage.conversationId],
      references: [customerConversation.id],
    }),
  })
)

export type CustomerConversation = typeof customerConversation.$inferSelect
export type NewCustomerConversation = typeof customerConversation.$inferInsert
export type ConversationMessage = typeof conversationMessage.$inferSelect
export type NewConversationMessage = typeof conversationMessage.$inferInsert
