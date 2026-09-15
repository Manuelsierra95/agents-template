import type { RealtimeEvent } from "@workspace/contracts/realtime"
import type { SSEStreamingApi } from "hono/streaming"
import type { RealtimeEventBus } from "./event-bus"
import { REALTIME_EVENT_TYPES } from "@workspace/contracts/realtime"
import { logger } from "@/lib/logger"

/**
 * `SseHub` — fans realtime events out to per-tenant SSE controllers.
 *
 * The Hub owns the **local** subscribers (one entry per open browser
 * connection). It subscribes once to the cross-pod bus and dispatches
 * each event to every local connection whose `organizationId` matches.
 *
 * The cross-pod bus (Redis) is separate; `bindTo()` installs the
 * dispatch handler. The Hub never talks to Redis directly.
 *
 * Why per-tenant fan-out at the Hub level too: defence in depth. Even
 * if a future bug lets a bus-wide event leak through, the Hub only
 * forwards events whose `organizationId` is in the connection's
 * subscriber set.
 */
class SseHub {
	private subscribers = new Map<string, Set<SSEStreamingApi>>()
	private busUnbind: (() => Promise<void>) | null = null

	/**
	 * Wire the bus → hub dispatch. Returns an unsubscribe function
	 * used during graceful shutdown so the bus stops feeding us.
	 *
	 * Idempotent: a second `bindTo()` call is a no-op (the first
	 * subscription remains the source of truth). This is what makes
	 * the `createApp({ eventBus })` path safe in tests — the same hub
	 * instance can be re-bound to the same bus without doubling events.
	 */
	async bindTo(bus: RealtimeEventBus): Promise<() => Promise<void>> {
		if (this.busUnbind) {
			// Already wired — return the same unsubscribe so callers can
			// treat the binding like a fresh acquire.
			return this.busUnbind
		}
		this.busUnbind = await bus.subscribe(async (event) => {
			try {
				this.dispatch(event)
			} catch (err) {
				logger.warn(
					{ err, type: event.type },
					"sse hub dispatch threw (ignored)",
				)
			}
		})
		return this.busUnbind
	}

	/**
	 * Register an SSE controller (one per browser connection). Returns
	 * an unregister callback for the route handler to call when the
	 * client aborts.
	 */
	addSubscriber(
		organizationId: string,
		controller: SSEStreamingApi,
	): () => void {
		let set = this.subscribers.get(organizationId)
		if (!set) {
			set = new Set()
			this.subscribers.set(organizationId, set)
		}
		set.add(controller)
		return () => {
			const cur = this.subscribers.get(organizationId)
			if (!cur) return
			cur.delete(controller)
			if (cur.size === 0) this.subscribers.delete(organizationId)
		}
	}

	private dispatch(event: RealtimeEvent): void {
		// Validate before sending — a malformed event from a misbehaving
		// publisher shouldn't reach the browser.
		if (!REALTIME_EVENT_TYPES.includes(event.type)) return
		const conns = this.subscribers.get(event.organizationId)
		if (!conns || conns.size === 0) return
		const data = JSON.stringify(event)
		for (const conn of conns) {
			try {
				conn.writeSSE({
					event: event.type,
					data,
					id: event.timestamp,
				})
			} catch (err) {
				// Client probably disconnected; the abort handler on the
				// route will eventually unregister. Don't crash the hub.
				logger.debug(
					{ err, type: event.type },
					"sse hub write failed",
				)
			}
		}
	}

	/** Diagnostic — exposed for tests. */
	subscriberCountFor(organizationId: string): number {
		return this.subscribers.get(organizationId)?.size ?? 0
	}
}

let globalHub: SseHub | null = null

export function getOrCreateSseHub(): SseHub {
	if (!globalHub) globalHub = new SseHub()
	return globalHub
}

export function resetSseHubForTests(): void {
	globalHub = null
}

