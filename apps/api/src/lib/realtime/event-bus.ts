import type { RealtimeEvent } from "@workspace/contracts/realtime"

/**
 * In-process + (optionally Redis-backed) pub/sub for `RealtimeEvent`s.
 *
 * Two implementations live next to this file:
 *   - `InMemoryEventBus` — used by default in dev and the full test suite.
 *     Synchronous fan-out to all subscribers in the same process.
 *   - `RedisRealtimeEventBus` — used when `REDIS_URL` is set, so multiple
 *     API replicas can each receive every event and fan out to their
 *     local SSE connections.
 *
 * Domain code (route handlers) only ever imports `RealtimeEventBus`
 * and `publishRealtime` — never touches Redis directly. That keeps the
 * rest of the app testable with the in-memory bus and free of extra
 * infrastructure.
 */
export interface RealtimeEventBus {
	/**
	 * Asynchronously publish an event. Must never throw — publishing a
	 * failed event is logged but does not break the caller. The
	 * `publishRealtime` helper enforces this contract.
	 */
	publish(event: RealtimeEvent): Promise<void>

	/**
	 * Subscribe a handler to every event the bus receives. Returns an
	 * unsubscribe function; awaiting the unsubscribe (or calling it
	 * synchronously) is supported. The handler runs once per event.
	 */
	subscribe(
		handler: (event: RealtimeEvent) => void | Promise<void>,
	): Promise<() => Promise<void>>

	/**
	 * Best-effort cleanup of upstream connections. Bus implementations
	 * may no-op if they have nothing to close.
	 */
	close?(): Promise<void>
}

/**
 * Marker constant — instances import this to keep the channel name
 * in a single place if we later want to namespace per-tenant.
 */
export const REALTIME_CHANNEL = "realtime:events"
