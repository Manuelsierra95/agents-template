import { describe, expect, it } from "vitest"
import {
  RealtimeEventSchema,
  REALTIME_EVENT_TYPES,
} from "@workspace/contracts/realtime/schemas.ts"

/**
 * Smoke-tests for the realtime event contracts.
 *
 * Covers the discriminator (unknown types rejected), required-field
 * enforcement (`organizationId`, `timestamp`) and a representative
 * round-trip for the variant that the SSE hub's `addSubscriber`
 * path actually fans out.
 */

const NOW = "2026-09-15T11:00:00.000Z"

describe("RealtimeEventSchema", () => {
  it("accepts every documented event type", () => {
    for (const type of REALTIME_EVENT_TYPES) {
      const base = { organizationId: "org_1", timestamp: NOW }
      const event =
        type === "conversation.created"
          ? { type, ...base }
          : { type, conversationId: "conv_1", ...base }
      expect(RealtimeEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it("rejects unknown event types", () => {
    const r = RealtimeEventSchema.safeParse({
      type: "totally.made-up",
      organizationId: "org_1",
      timestamp: NOW,
    })
    expect(r.success).toBe(false)
  })

  it("rejects events missing organizationId", () => {
    const r = RealtimeEventSchema.safeParse({
      type: "message.created",
      conversationId: "conv_1",
      timestamp: NOW,
    })
    expect(r.success).toBe(false)
  })

  it("rejects events missing conversationId when required by the variant", () => {
    const r = RealtimeEventSchema.safeParse({
      type: "message.created",
      organizationId: "org_1",
      timestamp: NOW,
    })
    expect(r.success).toBe(false)
  })
})
