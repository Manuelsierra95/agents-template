import type { RealtimeEvent } from "@workspace/contracts/realtime"
import type { RealtimeEventBus } from "@/lib/realtime/event-bus"
import { logger } from "@/lib/logger"

/**
 * Drop-in publishing helper used by every endpoint that emits a
 * `RealtimeEvent`. The contract is intentionally narrow:
 *
 *   - If no bus is wired (e.g. in a unit test), the call is a no-op.
 *   - If publishing fails, we log a warning and keep going — Postgres
 *     is the source of truth, the bus is a best-effort realtime
 *     surface. The dashboard refetches on SSE reconnect and converges
 *     to whatever the DB says.
 *
 * This is the documented "no event ever bricks a write" contract per
 * the spec section 10: a Redis outage cannot affect business writes.
 */
export async function publishRealtime(
	bus: RealtimeEventBus | undefined,
	event: RealtimeEvent,
): Promise<void> {
	if (!bus) return
	try {
		await bus.publish(event)
	} catch (err) {
		// `conversationId` is optional across the union — read it via a
		// narrow so a `conversation.created` event doesn't blow TypeScript
		// up here.
		const conversationId =
			"conversationId" in event ? event.conversationId : undefined
		logger.warn(
			{ err, type: event.type, conversationId },
			"realtime publish failed",
		)
	}
}
