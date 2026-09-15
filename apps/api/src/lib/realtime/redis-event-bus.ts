import { Redis } from "ioredis"
import type { RealtimeEvent } from "@workspace/contracts/realtime"
import { REALTIME_CHANNEL, type RealtimeEventBus } from "@/lib/realtime/event-bus"

const SUBSCRIBE_CHECK_INTERVAL_MS = 30_000

/**
 * Cross-pod fan-out for `RealtimeEvent`s via Redis Pub/Sub.
 *
 * Connection topology:
 *   - One PUBLISHER (regular `Redis` client) — used for `publish()`.
 *   - One SUBSCRIBER (clone) — long-running connection listening on
 *     `REALTIME_CHANNEL`. Decoding and dispatch runs in-process via
 *     the handlers installed with `subscribe()`.
 *
 * The class is intentionally tiny: it does not retry on parse errors
 * (the wire format is internal and a malformed event means the
 * publisher is broken — better fail loud in dev than paper over it).
 */
export class RedisRealtimeEventBus implements RealtimeEventBus {
	private publisher: Redis
	private subscriber: Redis
	private handlers = new Set<(e: RealtimeEvent) => void | Promise<void>>()
	private ready: Promise<void>

	constructor(url: string) {
		const sharedOptions = {
			lazyConnect: false,
			maxRetriesPerRequest: 2,
		}
		this.publisher = new Redis(url, sharedOptions)
		this.subscriber = new Redis(url, sharedOptions)
		this.ready = this.setupSubscriber()
	}

	private async setupSubscriber(): Promise<void> {
		// Wait until ioredis has connected before subscribing. ioredis
		// auto-retries on disconnect, so any handler we install after
		// `ready` resolves will see future events.
		if (this.subscriber.status !== "ready") {
			await new Promise<void>((resolve) => {
				this.subscriber.once("ready", () => resolve())
			})
		}
		await this.subscriber.subscribe(REALTIME_CHANNEL)

		this.subscriber.on("message", async (channel, message) => {
			if (channel !== REALTIME_CHANNEL) return
			let parsed: RealtimeEvent
			try {
				parsed = JSON.parse(message) as RealtimeEvent
			} catch {
				// Malformed payload — log and drop. Surface loudly so the
				// source can be found quickly in dev.
				// biome-ignore lint/suspicious/noConsole: dev diagnostic.
				console.error("[redis-bus] malformed message:", message)
				return
			}
			await Promise.all(
				[...this.handlers].map(async (h) => {
					try {
						await h(parsed)
					} catch (err) {
						// biome-ignore lint/suspicious/noConsole: dev diagnostic.
						console.error("[redis-bus] handler threw:", err)
					}
				}),
			)
		})

		// Periodic self-check: log if the subscriber silently disconnects
		// in production. ioredis will try to reconnect on its own; this
		// is only a diagnostic.
		setInterval(() => {
			if (this.subscriber.status !== "ready") {
				// biome-ignore lint/suspicious/noConsole: dev diagnostic.
				console.warn(
					`[redis-bus] subscriber status = ${this.subscriber.status}`,
				)
			}
		}, SUBSCRIBE_CHECK_INTERVAL_MS).unref()
	}

	async publish(event: RealtimeEvent): Promise<void> {
		// If the bus hasn't finished bootstrapping yet, wait it out —
		// otherwise early events would race the subscriber start.
		await this.ready
		await this.publisher.publish(REALTIME_CHANNEL, JSON.stringify(event))
	}

	async subscribe(
		handler: (event: RealtimeEvent) => void | Promise<void>,
	): Promise<() => Promise<void>> {
		await this.ready
		this.handlers.add(handler)
		return async () => {
			this.handlers.delete(handler)
		}
	}

	async close(): Promise<void> {
		try {
			await this.publisher.quit()
		} catch {
			// Ignore: connection may already be closed.
		}
		try {
			await this.subscriber.quit()
		} catch {
			// ditto
		}
	}
}

