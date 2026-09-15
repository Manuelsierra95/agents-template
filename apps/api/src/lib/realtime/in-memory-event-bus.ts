import type { RealtimeEvent } from "@workspace/contracts/realtime"
import type { RealtimeEventBus } from "./event-bus"

/**
 * In-process fan-out for tests and dev (no Redis).
 *
 * Uses a plain array of subscribers. A real-world Node app needs
 * careful serialization for delivery order, but every event handler
 * is awaited inside the dispatcher loop and delivery errors are caught
 * per-subscriber.
 */
export class InMemoryEventBus implements RealtimeEventBus {
	private subscribers = new Set<(e: RealtimeEvent) => void | Promise<void>>()

	async publish(event: RealtimeEvent): Promise<void> {
		const snapshot = [...this.subscribers]
		await Promise.all(
			snapshot.map(async (sub) => {
				try {
					await sub(event)
				} catch (err) {
					// Biome-ignore lint/suspicious/noConsole: dev-time diagnostic.
					console.error("[event-bus] subscriber threw:", err)
				}
			}),
		)
	}

	async subscribe(
		handler: (event: RealtimeEvent) => void | Promise<void>,
	): Promise<() => Promise<void>> {
		this.subscribers.add(handler)
		return async () => {
			this.subscribers.delete(handler)
		}
	}

	async close(): Promise<void> {
		this.subscribers.clear()
	}

	// Test helper — count of currently-registered subscribers. The
	// InMemoryEventBus is single-tenant by construction (one instance per
	// process in dev), so we don't parameterize by org here. In a
	// multi-tenant world, every subscriber is scoped to one
	// organizationId and this helper would take that key.
	get subscriberCount(): number {
		return this.subscribers.size
	}
}
