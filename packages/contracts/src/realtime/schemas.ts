import { z } from "zod"

/**
 * Wire shape for every realtime event published on the in-process bus (or
 * Redis when `REDIS_URL` is set). Single discriminated union keyed by
 * `type` — the variant's `conversationId` is required when the event
 * describes a change to an existing conversation and optional for
 * top-level creations.
 *
 * The server-side bus (`apps/api/src/lib/realtime/sse-hub.ts`) filters
 * `type` against `REALTIME_EVENT_TYPES` before forwarding events to
 * subscribed SSE clients, so adding a new event means: add a variant
 * here, extend `REALTIME_EVENT_TYPES`, and handle it on the client.
 */

const baseFields = {
  organizationId: z.string().min(1),
  timestamp: z.string().datetime(),
  conversationId: z.string().min(1).optional(),
}

export const MessageCreatedEventSchema = z.object({
  type: z.literal("message.created"),
  ...baseFields,
  conversationId: z.string().min(1), // required for per-conversation events
})

export const ActivityCreatedEventSchema = z.object({
  type: z.literal("activity.created"),
  ...baseFields,
  conversationId: z.string().min(1),
})

export const ApprovalCreatedEventSchema = z.object({
  type: z.literal("approval.created"),
  ...baseFields,
  conversationId: z.string().min(1),
})

export const ApprovalUpdatedEventSchema = z.object({
  type: z.literal("approval.updated"),
  ...baseFields,
  conversationId: z.string().min(1),
})

export const ConversationUpdatedEventSchema = z.object({
  type: z.literal("conversation.updated"),
  ...baseFields,
  conversationId: z.string().min(1),
})

export const ConversationCreatedEventSchema = z.object({
  type: z.literal("conversation.created"),
  organizationId: z.string().min(1),
  timestamp: z.string().datetime(),
  // Top-level creation — no existing conversationId yet.
})

export const AppointmentCreatedEventSchema = z.object({
  type: z.literal("appointment.created"),
  ...baseFields,
  conversationId: z.string().min(1).optional(),
})

export const AppointmentUpdatedEventSchema = z.object({
  type: z.literal("appointment.updated"),
  ...baseFields,
  conversationId: z.string().min(1).optional(),
})

export const RealtimeEventSchema = z.discriminatedUnion("type", [
  MessageCreatedEventSchema,
  ActivityCreatedEventSchema,
  ApprovalCreatedEventSchema,
  ApprovalUpdatedEventSchema,
  ConversationUpdatedEventSchema,
  ConversationCreatedEventSchema,
  AppointmentCreatedEventSchema,
  AppointmentUpdatedEventSchema,
])

export const REALTIME_EVENT_TYPES = [
  "message.created",
  "activity.created",
  "approval.created",
  "approval.updated",
  "conversation.updated",
  "conversation.created",
  "appointment.created",
  "appointment.updated",
] as const

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number]
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>
